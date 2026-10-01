import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const SCRIPT = resolve(__dirname, "..", "..", "..", "scripts", "deploy-dreamhost.sh")
const src = () => readFileSync(SCRIPT, "utf8")
const run = (args: string[], env: Record<string, string>) =>
  spawnSync("bash", [SCRIPT, ...args], { env: { PATH: process.env.PATH ?? "", HOME: "/nonexistent", ...env }, encoding: "utf8" })

describe("scripts/deploy-dreamhost.sh (local wrapper)", () => {
  it("parses", () => {
    expect(() => execFileSync("bash", ["-n", SCRIPT])).not.toThrow()
  })
  it("refuses to run without OYL_DH_SSH and lists every OYL_DH_* key to add to .env", () => {
    const res = run(["--dry-run"], { OYL_DH_SSH: "" })
    expect(res.status).toBe(1)
    for (const k of ["OYL_DH_SSH", "OYL_DH_WWW_ROOT", "OYL_DH_API_ROOT", "OYL_DH_API_BASE", "OYL_DH_SITE_URL", "OYL_DH_API_URL", "OYL_DH_CSP_HEADER"]) {
      expect(res.stderr, k).toContain(k)
    }
    expect(res.stderr).not.toContain("OYL_DH_APP_ROOT")
  })
  it("validates --only", () => {
    let res = run(["--only", "pi"], { OYL_DH_SSH: "x@y" })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("--only")
    res = run(["--only"], { OYL_DH_SSH: "x@y" })
    expect(res.status).toBe(1)
    res = run(["--yolo"], { OYL_DH_SSH: "x@y" })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("unknown argument")
  })
  it("checks for a dirty tree before building or publishing anything, and delegates to the shared publish scripts", () => {
    const s = src()
    const dirty = s.indexOf("git status --porcelain")
    expect(dirty).toBeGreaterThan(-1)
    for (const later of ["pnpm vanilla build:lib", "pnpm php-app build", "dreamhost/publish-www.sh", "dreamhost/publish-api.sh"]) {
      expect(s.indexOf(later), later).toBeGreaterThan(dirty)
    }
    expect(s).not.toContain("rsync ")
    expect(s).not.toContain("composer install")
  })
  it("never sources .env wholesale", () => {
    expect(src()).not.toMatch(/^\s*(source|\.)\s+.*\.env/m)
  })
})
