import { execFileSync, spawnSync } from "node:child_process"
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const SCRIPT = resolve(__dirname, "..", "..", "..", "scripts", "dreamhost", "publish-api.sh")
const src = () => readFileSync(SCRIPT, "utf8")
const run = (args: string[], env: Record<string, string>) =>
  spawnSync("bash", [SCRIPT, ...args], { env: { PATH: process.env.PATH ?? "", HOME: "/nonexistent", ...env }, encoding: "utf8" })

describe("scripts/dreamhost/publish-api.sh", () => {
  it("parses", () => {
    expect(() => execFileSync("bash", ["-n", SCRIPT])).not.toThrow()
  })
  it("refuses to run without DH_SSH / DH_API_ROOT and names them", () => {
    const res = run(["--dry-run"], {})
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("DH_SSH")
    expect(res.stderr).toContain("DH_API_ROOT")
  })
  it("rejects unknown arguments", () => {
    const res = run(["--yolo"], { DH_SSH: "x@y", DH_API_ROOT: "r" })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("unknown argument")
  })
  it("rsync excludes bootstrap/cache and storage/app (a local config:cache or upload must never ship)", () => {
    const line = src().split("\n").find((l) => l.trimStart().startsWith("RSYNC_FLAGS=("))
    expect(line).toBeDefined()
    expect(line).toContain("--exclude 'bootstrap/cache/'")
    expect(line).toContain("--exclude 'storage/app/'")
    expect(line).toContain("--exclude vendor/")
    expect(line).toContain("--exclude '.env'")
    // DreamHost's ACME challenge dir lives in the api docroot; --delete must never touch it.
    expect(line).toContain("--exclude 'public/.well-known/'")
  })
  it("verifies the Strapi-owned schema remotely instead of migrating or seeding", () => {
    expect(src()).toContain("php artisan camis:strapi-schema-check")
    expect(src()).not.toContain("php artisan migrate")
    expect(src()).not.toContain("RolePermissionSeeder")
  })
  it("fails fast unless the remote laravel/.env carries a JWT_SECRET of at least 32 bytes, and never echoes it", () => {
    const s = src()
    expect(s).toContain("^JWT_SECRET=")
    expect(s).toContain("-ge 32")
    const envCheck = s.indexOf("[ -f .env ]")
    const guard = s.indexOf("secret_len")
    expect(envCheck, ".env existence check").toBeGreaterThan(-1)
    expect(guard).toBeGreaterThan(envCheck)
    expect(guard).toBeLessThan(s.indexOf("composer install"))
    expect(s).toContain("apps/camis-php-oyl/README.md")
    expect(s).not.toMatch(/echo[^\n]*\$\{?secret/)
  })
  it("recreates the rsync-excluded runtime dirs before composer install (first deploy self-heals), after the .env/JWT checks", () => {
    const s = src()
    const mkdir = s.indexOf("mkdir -p bootstrap/cache")
    expect(mkdir).toBeGreaterThan(-1)
    expect(mkdir).toBeGreaterThan(s.indexOf("secret_len"))
    expect(mkdir).toBeLessThan(s.indexOf("composer install"))
    const line = s.split("\n").find((l) => l.includes("mkdir -p bootstrap/cache"))!
    for (const d of ["storage/logs", "storage/framework/cache", "storage/app", "storage/framework/sessions", "storage/framework/views"]) {
      expect(line, d).toContain(d)
    }
  })
  it("bounds the health check with --max-time", () => {
    const curl = src().split("\n").filter((l) => l.includes("curl "))
    expect(curl.length).toBeGreaterThan(0)
    for (const l of curl) expect(l, l).toContain("--max-time 20")
  })
  it("clears the config cache before the schema check (bootstrap/cache is rsync-excluded, so the check would read the previous deploy's cached config)", () => {
    const s = src()
    const clear = s.indexOf("php artisan config:clear")
    const check = s.indexOf("php artisan camis:strapi-schema-check")
    expect(clear).toBeGreaterThan(-1)
    expect(clear).toBeLessThan(check)
  })
  it("is non-interactive: every ssh and rsync -e carries BatchMode=yes; no StrictHostKeyChecking=no", () => {
    const s = src()
    const sshCalls = s.split("\n").filter((l) => /^\s*(ssh|rsync)\b/.test(l) || /\brsync\s+"\$\{RSYNC_FLAGS/.test(l))
    expect(sshCalls.length).toBeGreaterThan(0)
    for (const l of sshCalls) expect(l, l).toMatch(/BatchMode=yes|SSH_OPTS|RSYNC_FLAGS/)
    expect(s).toContain("-o BatchMode=yes")
    expect(s).not.toContain("StrictHostKeyChecking=no")
  })
  it("preflights php/composer in a login shell (DreamHost picks the CLI PHP via ~/.bash_profile), like the remote body", () => {
    expect(src()).toContain("bash -l -c")
    expect(src()).toContain("bash -l -s")
  })
})

// Behavioural preflight: a copy of the script in a throwaway tree (so laravel/artisan and git
// are fakes), with an ssh fake that runs the remote command against a PATH holding only the
// tools the test chooses. The remote `bash` is a shim that drops -l: a real login shell would
// source the host's /etc/profile (macOS path_helper) and find this machine's php/composer.
describe("scripts/dreamhost/publish-api.sh preflight (behavioural)", () => {
  let tmp: string
  afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

  const writeExec = (path: string, body: string) => { writeFileSync(path, body); chmodSync(path, 0o755) }
  const setup = (remoteTools: string[]) => {
    tmp = mkdtempSync(join(tmpdir(), "publish-api-"))
    const script = join(tmp, "scripts", "dreamhost", "publish-api.sh")
    mkdirSync(join(tmp, "scripts", "dreamhost"), { recursive: true })
    copyFileSync(SCRIPT, script)
    mkdirSync(join(tmp, "apps", "camis-php-oyl", "laravel"), { recursive: true })
    writeFileSync(join(tmp, "apps", "camis-php-oyl", "laravel", "artisan"), "")
    const bin = join(tmp, "bin"); const remote = join(tmp, "remote")
    mkdirSync(bin); mkdirSync(remote)
    writeExec(join(bin, "git"), "#!/bin/bash\nprintf 'abc1234\\n'\n")
    writeExec(join(bin, "rsync"), "#!/bin/bash\nexit 0\n")
    writeExec(join(bin, "ssh"), `#!/bin/bash\nPATH="${remote}" exec /bin/bash -c "\${@: -1}"\n`)
    writeExec(join(remote, "bash"), "#!/bin/bash\nargs=()\nfor a in \"$@\"; do [[ $a == -l ]] || args+=(\"$a\"); done\nexec /bin/bash \"${args[@]}\"\n")
    for (const t of remoteTools) writeExec(join(remote, t), "#!/bin/bash\nexit 0\n")
    return spawnSync("bash", [script, "--dry-run"], {
      env: { PATH: `${bin}:${process.env.PATH ?? ""}`, HOME: "/nonexistent", DH_SSH: "x@y", DH_API_ROOT: "camis" },
      encoding: "utf8",
    })
  }

  it("fails when the login shell has php but no composer", () => {
    const res = setup(["php"])
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("php/composer missing")
  })
  it("fails when the login shell has composer but no php", () => {
    const res = setup(["composer"])
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("php/composer missing")
  })
  it("passes the preflight when both are present", () => {
    const res = setup(["php", "composer"])
    expect(res.stderr).not.toContain("php/composer missing")
    expect(res.status, res.stderr).toBe(0)
  })
})
