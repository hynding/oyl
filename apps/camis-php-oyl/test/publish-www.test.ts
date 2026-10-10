import { execFileSync, spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const SCRIPT = resolve(__dirname, "..", "..", "..", "scripts", "dreamhost", "publish-www.sh")
const src = () => readFileSync(SCRIPT, "utf8")

// A Stencil prod build's index.html: the anti-FOUC inline script, the hashed module loader and
// the deploy meta exactly as Stencil emits it (no self-closing slash).
const INDEX = `<!doctype html><html><head>
<script>(function(){})()</script>
<meta name="oyl-api-base" content="">
<script type="module" src="/build/p-1.js" data-stencil data-resources-url="/build/" data-stencil-namespace="oyl"></script>
</head><body><oyl-app></oyl-app></body></html>`
const TEMPLATE = [
  "RewriteCond %{REQUEST_URI} !^/(build|themes)/",
  "Header always set __CSP_HEADER__ \"script-src 'self' __CSP_SCRIPT_HASHES__; connect-src 'self' __API_ORIGIN__;\"",
  "",
].join("\n")

let tmp: string
let fixture: string
let bin: string
let capture: string

const writeExec = (path: string, body: string) => { writeFileSync(path, body); chmodSync(path, 0o755) }

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "publish-www-"))
  fixture = join(tmp, "app"); bin = join(tmp, "bin"); capture = join(tmp, "capture")
  for (const d of ["build", "themes"]) mkdirSync(join(fixture, d), { recursive: true })
  mkdirSync(bin); mkdirSync(capture)
  writeFileSync(join(fixture, "index.html"), INDEX)
  writeFileSync(join(fixture, "build", "oyl.esm.js"), "export {}\n")
  writeFileSync(join(fixture, "build", "p-1.js"), "export const a = 1\n")
  writeFileSync(join(fixture, "build", "p-1.js.map"), "{}\n")
  writeFileSync(join(fixture, "host.config.json"), "{}\n")
  writeFileSync(join(fixture, "themes", "classic.css"), "body{}\n")
  writeFileSync(join(fixture, "tokens.css"), ":root{}\n")
  writeFileSync(join(fixture, "favicon.svg"), "<svg/>\n")
  writeFileSync(join(fixture, "htaccess.template"), TEMPLATE)
  writeExec(join(bin, "ssh"), "#!/usr/bin/env bash\nprintf '%s\\n' \"$@\" >> \"$FAKE_CAPTURE/ssh\"\nexit 0\n")
  // The push: record argv, the staged file list and the two rendered files before the script's trap removes the stage.
  writeExec(join(bin, "rsync"), [
    "#!/usr/bin/env bash",
    "printf '%s\\n' \"$@\" > \"$FAKE_CAPTURE/argv\"",
    "src=\"${@: -2:1}\"",
    "( cd \"$src\" && find . -type f | sort ) > \"$FAKE_CAPTURE/files\"",
    "ls -ld \"$src\" | cut -c1-10 > \"$FAKE_CAPTURE/rootmode\"",
    "ls -l \"$src/index.html\" | cut -c1-10 > \"$FAKE_CAPTURE/filemode\"",
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
const good = () => ({ DH_SSH: "x@y", DH_WWW_ROOT: "www", DH_API_BASE: "https://api.example.test/api", DH_HTACCESS_TEMPLATE: join(fixture, "htaccess.template") })

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
  it("refuses an unbuilt source (build/oyl.esm.js missing → run pnpm stencil build)", () => {
    rmSync(join(fixture, "build"), { recursive: true })
    const res = run([], { ...good(), DH_WWW_SRC: fixture })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("pnpm stencil build")
  })
  it("refuses a dev build (index.html without the hashed loader → run pnpm stencil build)", () => {
    writeFileSync(join(fixture, "index.html"), INDEX.replace('src="/build/p-1.js"', 'src="/build/oyl.esm.js"'))
    const res = run([], { ...good(), DH_WWW_SRC: fixture })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("pnpm stencil build")
  })
  it("refuses a missing htaccess template", () => {
    const res = run([], { ...good(), DH_WWW_SRC: fixture, DH_HTACCESS_TEMPLATE: join(fixture, "nope.template") })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("template")
  })
  it("refuses an index.html without the oyl-api-base meta (it would silently fall back to same-origin /api)", () => {
    writeFileSync(join(fixture, "index.html"), INDEX.replace(/<meta name="oyl-api-base"[^>]*>/, ""))
    const res = run([], { ...good(), DH_WWW_SRC: fixture })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("oyl-api-base")
  })
  it("stages exactly the Stencil asset roots + .htaccess + DEPLOYED, without source maps or host.config.json, injects the base and pushes with --delete", () => {
    const res = run([], { ...good(), DH_API_BASE: "https://api.example.test/api/", DH_WWW_SRC: fixture })
    expect(res.status, res.stderr).toBe(0)
    const files = readFileSync(join(capture, "files"), "utf8").trim().split("\n")
    expect(files).toEqual([
      "./.htaccess", "./DEPLOYED", "./build/oyl.esm.js", "./build/p-1.js", "./favicon.svg", "./index.html", "./themes/classic.css", "./tokens.css",
    ])
    const html = readFileSync(join(capture, "index.html"), "utf8")
    expect(html).toContain('<meta name="oyl-api-base" content="https://api.example.test/api" />')
    const htaccess = readFileSync(join(capture, "htaccess"), "utf8")
    expect(htaccess.match(/'sha256-[A-Za-z0-9+/=]+'/g)).toHaveLength(1)
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
  describe("root-path guard", () => {
    for (const bad of [".", "./", "/home/u/www", "~/www", "~", "..", "../www", "domains/../www", "domains/x/.."]) {
      it(`refuses DH_WWW_ROOT=${JSON.stringify(bad)} (rsync --delete would hit the wrong tree)`, () => {
        const res = run(["--dry-run"], { ...good(), DH_WWW_ROOT: bad, DH_WWW_SRC: fixture })
        expect(res.status).toBe(1)
        expect(res.stderr).toContain("publish-www: DH_WWW_ROOT")
        expect(existsSync(join(capture, "argv")), "rsync must not run").toBe(false)
      })
    }
    it("refuses a DH_API_ROOT nested under DH_WWW_ROOT, or equal to it, and names both", () => {
      for (const [www, api] of [["domains/x", "domains/x/camis"], ["domains/x/www/api", "domains/x/www"], ["domains/x/www", "domains/x/www/"]]) {
        const res = run(["--dry-run"], { ...good(), DH_WWW_ROOT: www, DH_API_ROOT: api, DH_WWW_SRC: fixture })
        expect(res.status, `${www} vs ${api}`).toBe(1)
        expect(res.stderr).toContain("DH_WWW_ROOT")
        expect(res.stderr).toContain("DH_API_ROOT")
      }
    })
    it("accepts sibling roots that only share a string prefix", () => {
      for (const [www, api] of [["domains/x/www", "domains/x/camis"], ["domains/x/www", "domains/x/www2"]]) {
        const res = run(["--dry-run"], { ...good(), DH_WWW_ROOT: www, DH_API_ROOT: api, DH_WWW_SRC: fixture })
        expect(res.status, res.stderr).toBe(0)
      }
    })
  })
  describe("first-deploy guard", () => {
    const failingCheckSsh = () => writeExec(join(bin, "ssh"), [
      "#!/usr/bin/env bash",
      "printf '%s\\n' \"$@\" >> \"$FAKE_CAPTURE/ssh\"",
      "[[ \"${@: -1}\" == true ]] && exit 0",
      "exit 1",
      "",
    ].join("\n"))
    it("stops before rsync when the remote root is neither a previous deploy nor empty, and names the override", () => {
      failingCheckSsh()
      const res = run([], { ...good(), DH_WWW_SRC: fixture })
      expect(res.status).toBe(1)
      expect(res.stderr).toContain("DH_FIRST_DEPLOY=1")
      expect(existsSync(join(capture, "argv")), "rsync must not run").toBe(false)
      const sshLog = readFileSync(join(capture, "ssh"), "utf8")
      expect(sshLog).toContain("bash -l -c")
      expect(sshLog).toContain("DEPLOYED")
      expect(sshLog).toContain(".well-known")
    })
    it("DH_FIRST_DEPLOY=1 overrides it for a genuinely new root", () => {
      failingCheckSsh()
      const res = run([], { ...good(), DH_WWW_SRC: fixture, DH_FIRST_DEPLOY: "1" })
      expect(res.status, res.stderr).toBe(0)
      expect(existsSync(join(capture, "argv"))).toBe(true)
    })
    it("is skipped under --dry-run (which mutates nothing)", () => {
      failingCheckSsh()
      const res = run(["--dry-run"], { ...good(), DH_WWW_SRC: fixture })
      expect(res.status, res.stderr).toBe(0)
    })
    // The remote check itself, run for real against a local "home" (ssh fake executes it there).
    it("the remote check passes for a missing root, a previous deploy, or only .well-known, and fails otherwise (root quoted)", () => {
      const home = join(tmp, "home")
      mkdirSync(home)
      writeExec(join(bin, "ssh"), `#!/usr/bin/env bash\ncd "${home}" && exec /bin/bash -c "\${@: -1}"\n`)
      const deploy = () => run([], { ...good(), DH_WWW_ROOT: "my site", DH_WWW_SRC: fixture })
      expect(deploy().status, "missing root").toBe(0)
      mkdirSync(join(home, "my site", ".well-known"), { recursive: true })
      expect(deploy().status, "only .well-known").toBe(0)
      writeFileSync(join(home, "my site", "index.html"), "someone else's site")
      expect(deploy().status, "foreign content").toBe(1)
      writeFileSync(join(home, "my site", "DEPLOYED"), "sha=x\n")
      expect(deploy().status, "previous deploy").toBe(0)
    })
  })
  describe("health checks", () => {
    // Fake curl answering like a healthy host; insists on --max-time (no unbounded hang in CI).
    const fakeCurl = () => writeExec(join(bin, "curl"), [
      "#!/usr/bin/env bash",
      "[[ \" $* \" == *\" --max-time 20 \"* ]] || { echo 'curl without --max-time 20' >&2; exit 99; }",
      "url=\"${@: -1}\"",
      "if [[ \" $* \" == *\" -sI \"* ]]; then printf '%s' \"$FAKE_HEADERS\"; exit 0; fi",
      "case \"$url\" in",
      "  */journal) printf '%s\\n%s' '<oyl-app></oyl-app>' \"${FAKE_JOURNAL_CODE:-200}\" ;;",
      "  */build/does-not-exist.js) printf 404 ;;",
      "  */DEPLOYED) printf 403 ;;",
      "  */) printf 200 ;;",
      "esac",
      "",
    ].join("\n"))
    const site = { DH_SITE_URL: "https://app.example.test" }
    const nosniff = "HTTP/2 200\r\nX-Content-Type-Options: nosniff\r\ncontent-type: text/html\r\n\r\n"
    it("passes on a healthy host (header match is case-insensitive) with every curl time-bounded", () => {
      fakeCurl()
      const res = run([], { ...good(), ...site, DH_WWW_SRC: fixture, FAKE_HEADERS: nosniff })
      expect(res.status, res.stderr).toBe(0)
      expect(res.stdout).toContain("site is up")
    })
    it("fails naming mod_headers when the nosniff header is absent (the .htaccess headers block is inert)", () => {
      fakeCurl()
      const res = run([], { ...good(), ...site, DH_WWW_SRC: fixture, FAKE_HEADERS: "HTTP/2 200\r\ncontent-type: text/html\r\n\r\n" })
      expect(res.status).toBe(1)
      expect(res.stderr).toContain("mod_headers")
    })
    it("reports the observed status when the /journal deep link fails", () => {
      fakeCurl()
      const res = run([], { ...good(), ...site, DH_WWW_SRC: fixture, FAKE_HEADERS: nosniff, FAKE_JOURNAL_CODE: "500" })
      expect(res.status).toBe(1)
      expect(res.stderr).toContain("/journal")
      expect(res.stderr).toContain("500")
    })
  })
  it("ships a web root Apache can read (mktemp -d is 700, and rsync -a copies the stage root's mode onto the web root)", () => {
    chmodSync(join(fixture, "index.html"), 0o600)
    const res = run([], { ...good(), DH_WWW_SRC: fixture })
    expect(res.status, res.stderr).toBe(0)
    expect(readFileSync(join(capture, "rootmode"), "utf8").trim()).toBe("drwxr-xr-x")
    expect(readFileSync(join(capture, "filemode"), "utf8").trim()).toBe("-rw-r--r--")
    // Portable: macOS openrsync rejects --chmod, so the stage is normalised instead.
    expect(readFileSync(join(capture, "argv"), "utf8")).not.toContain("--chmod")
  })
  it("never weakens host-key checking", () => {
    expect(src()).not.toContain("StrictHostKeyChecking=no")
  })
})
