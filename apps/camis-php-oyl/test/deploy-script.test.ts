import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const SCRIPT = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "scripts",
  "deploy-dreamhost.sh",
)

describe("deploy-dreamhost.sh", () => {
  it("parses", () => {
    expect(() => execFileSync("bash", ["-n", SCRIPT])).not.toThrow()
  })
  it("refuses to run without OYL_DH_SSH and says which keys to set", () => {
    const res = spawnSync("bash", [SCRIPT, "--dry-run"], {
      env: {
        PATH: process.env.PATH ?? "",
        HOME: "/nonexistent",
        OYL_DH_SSH: "",
      },
      encoding: "utf8",
    })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("OYL_DH_SSH")
    expect(res.stderr).toContain("OYL_DH_APP_ROOT")
  })
  it("rejects unknown arguments", () => {
    const res = spawnSync("bash", [SCRIPT, "--yolo"], {
      env: { PATH: process.env.PATH ?? "", OYL_DH_SSH: "x@y" },
      encoding: "utf8",
    })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("unknown argument")
  })
  it("rsync excludes bootstrap/cache and storage/app (a local config:cache or upload must never ship)", () => {
    const src = readFileSync(SCRIPT, "utf8")
    const line = src
      .split("\n")
      .find((l) => l.trimStart().startsWith("RSYNC_FLAGS=("))
    expect(line).toBeDefined()
    expect(line).toContain("--exclude 'bootstrap/cache/'")
    expect(line).toContain("--exclude 'storage/app/'")
  })
  it("verifies the Strapi-owned schema remotely instead of migrating or seeding", () => {
    const src = readFileSync(SCRIPT, "utf8")
    expect(src).toContain("php artisan camis:strapi-schema-check")
    expect(src).not.toContain("php artisan migrate")
    expect(src).not.toContain("RolePermissionSeeder")
  })
  it("clears the config cache before the schema check (rsync excludes bootstrap/cache, so the check would read the previous deploy's cached config)", () => {
    const src = readFileSync(SCRIPT, "utf8")
    const clear = src.indexOf("php artisan config:clear")
    const check = src.indexOf("php artisan camis:strapi-schema-check")
    expect(clear, "config:clear is missing").toBeGreaterThan(-1)
    expect(check).toBeGreaterThan(-1)
    expect(clear).toBeLessThan(check)
  })
})
