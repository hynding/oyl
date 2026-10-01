import { execFileSync, spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const SCRIPT = resolve(__dirname, "..", "..", "..", "scripts", "dreamhost", "publish-www.sh")
const src = () => readFileSync(SCRIPT, "utf8")

const INDEX = `<!doctype html><html><head>
<script>(function(){})()</script>
<script type="importmap">{"imports":{"@oyl/all-of-oyl":"/vendor/all-of-oyl/index.js"}}</script>
<meta name="oyl-api-base" content="" />
</head><body><script type="module" src="/src/main.js"></script></body></html>`

let tmp: string
let fixture: string
let bin: string
let capture: string

const writeExec = (path: string, body: string) => { writeFileSync(path, body); chmodSync(path, 0o755) }

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "publish-www-"))
  fixture = join(tmp, "app"); bin = join(tmp, "bin"); capture = join(tmp, "capture")
  for (const d of ["src", "styles", "vendor/all-of-oyl"]) mkdirSync(join(fixture, d), { recursive: true })
  mkdirSync(bin); mkdirSync(capture)
  writeFileSync(join(fixture, "index.html"), INDEX)
  writeFileSync(join(fixture, "src", "a.js"), "export const a = 1\n")
  writeFileSync(join(fixture, "src", "a.test.js"), "// must not ship\n")
  writeFileSync(join(fixture, "styles", "x.css"), "body{}\n")
  writeFileSync(join(fixture, "vendor", "all-of-oyl", "index.js"), "export {}\n")
  writeFileSync(join(fixture, "package.json"), "{}\n")
  writeExec(join(bin, "ssh"), "#!/usr/bin/env bash\nprintf '%s\\n' \"$@\" >> \"$FAKE_CAPTURE/ssh\"\nexit 0\n")
  // The push: record argv, the staged file list and the two rendered files before the script's trap removes the stage.
  writeExec(join(bin, "rsync"), [
    "#!/usr/bin/env bash",
    "printf '%s\\n' \"$@\" > \"$FAKE_CAPTURE/argv\"",
    "src=\"${@: -2:1}\"",
    "( cd \"$src\" && find . -type f | sort ) > \"$FAKE_CAPTURE/files\"",
    "cp \"$src/index.html\" \"$FAKE_CAPTURE/index.html\"",
    "cp \"$src/.htaccess\" \"$FAKE_CAPTURE/htaccess\"",
    "exit 0",
    "",
  ].join("\n"))
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

const run = (args: string[], env: Record<string, string>) =>
  spawnSync("bash", [SCRIPT, ...args], {
    env: { PATH: `${bin}:${process.env.PATH ?? ""}`, HOME: "/nonexistent", FAKE_CAPTURE: capture, ...env },
    encoding: "utf8",
  })
const good = () => ({ DH_SSH: "x@y", DH_WWW_ROOT: "www", DH_API_BASE: "https://api.example.test/api" })

describe("scripts/dreamhost/publish-www.sh", () => {
  it("parses", () => {
    expect(() => execFileSync("bash", ["-n", SCRIPT])).not.toThrow()
  })
  it("refuses to run without DH_SSH / DH_WWW_ROOT / DH_API_BASE and names them", () => {
    const res = run(["--dry-run"], {})
    expect(res.status).toBe(1)
    for (const k of ["DH_SSH", "DH_WWW_ROOT", "DH_API_BASE"]) expect(res.stderr).toContain(k)
  })
  it("rejects unknown arguments", () => {
    const res = run(["--yolo"], good())
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("unknown argument")
  })
  it("refuses an unbuilt source (vendor/all-of-oyl/index.js missing → run build:lib)", () => {
    rmSync(join(fixture, "vendor"), { recursive: true })
    const res = run([], { ...good(), DH_WWW_SRC: fixture })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("build:lib")
  })
  it("refuses an index.html without the oyl-api-base meta (it would silently fall back to same-origin /api)", () => {
    writeFileSync(join(fixture, "index.html"), INDEX.replace(/<meta name="oyl-api-base"[^>]*>/, ""))
    const res = run([], { ...good(), DH_WWW_SRC: fixture })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("oyl-api-base")
  })
  it("stages exactly the four asset roots + .htaccess + DEPLOYED, without *.test.js, injects the base and pushes with --delete", () => {
    const res = run([], { ...good(), DH_API_BASE: "https://api.example.test/api/", DH_WWW_SRC: fixture })
    expect(res.status, res.stderr).toBe(0)
    const files = readFileSync(join(capture, "files"), "utf8").trim().split("\n")
    expect(files).toEqual([
      "./.htaccess", "./DEPLOYED", "./index.html", "./src/a.js", "./styles/x.css", "./vendor/all-of-oyl/index.js",
    ])
    const html = readFileSync(join(capture, "index.html"), "utf8")
    expect(html).toContain('<meta name="oyl-api-base" content="https://api.example.test/api" />')
    const htaccess = readFileSync(join(capture, "htaccess"), "utf8")
    expect(htaccess.match(/'sha256-[A-Za-z0-9+/=]+'/g)).toHaveLength(2)
    expect(htaccess).toContain("connect-src 'self' https://api.example.test;")
    expect(htaccess).toContain("Header always set Content-Security-Policy ")
    const argv = readFileSync(join(capture, "argv"), "utf8").trim().split("\n")
    expect(argv).toContain("--delete")
    expect(argv).toContain("--exclude")
    expect(argv).toContain(".well-known/")
    expect(argv.some((a) => a.includes("BatchMode=yes"))).toBe(true)
    expect(argv.at(-1)).toBe("x@y:www/")
  })
  it("injects DH_API_BASE literally, even when it contains $-replacement patterns", () => {
    const base = "https://api.example.test/api/v$&1"
    const res = run([], { ...good(), DH_API_BASE: base, DH_WWW_SRC: fixture })
    expect(res.status, res.stderr).toBe(0)
    const html = readFileSync(join(capture, "index.html"), "utf8")
    expect(html).toContain(`<meta name="oyl-api-base" content="${base}" />`)
    expect(html.split('<meta name="oyl-api-base"').length - 1).toBe(1)
  })
  it("an empty DH_CSP_HEADER (unset GitHub variable) still renders the enforcing header; report-only is honoured", () => {
    let res = run([], { ...good(), DH_WWW_SRC: fixture, DH_CSP_HEADER: "" })
    expect(res.status, res.stderr).toBe(0)
    expect(readFileSync(join(capture, "htaccess"), "utf8")).toContain("Header always set Content-Security-Policy \"")
    res = run([], { ...good(), DH_WWW_SRC: fixture, DH_CSP_HEADER: "Content-Security-Policy-Report-Only" })
    expect(res.status, res.stderr).toBe(0)
    expect(readFileSync(join(capture, "htaccess"), "utf8")).toContain("Content-Security-Policy-Report-Only")
  })
  it("--dry-run passes -n to rsync and runs no remote step", () => {
    const res = run(["--dry-run"], { ...good(), DH_WWW_SRC: fixture })
    expect(res.status, res.stderr).toBe(0)
    expect(readFileSync(join(capture, "argv"), "utf8").split("\n")).toContain("-n")
    expect(res.stdout).toContain("DRY RUN")
  })
  it("never weakens host-key checking", () => {
    expect(src()).not.toContain("StrictHostKeyChecking=no")
  })
})
