import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

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
