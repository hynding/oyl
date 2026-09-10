import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const read = (rel: string): string => readFileSync(resolve(PKG, rel), "utf8")

describe("build.mjs", () => {
  const src = read("scripts/build.mjs")
  it("parses", () => {
    expect(() =>
      execFileSync("node", ["--check", resolve(PKG, "scripts/build.mjs")]),
    ).not.toThrow()
  })
  it("scaffolds for the Strapi storage layout", () => {
    expect(src).toContain('"--storage", "strapi"')
  })
  it("re-scaffolds a laravel/ that predates the layout (no firebase/php-jwt)", () => {
    expect(src).toContain('"firebase/php-jwt"')
    expect(src).toContain("rmSync(LARAVEL")
  })
})

describe("dev.mjs", () => {
  const src = read("scripts/dev.mjs")
  it("parses", () => {
    expect(() =>
      execFileSync("node", ["--check", resolve(PKG, "scripts/dev.mjs")]),
    ).not.toThrow()
  })
  it("serves on the Strapi dev database and never migrates or seeds", () => {
    expect(src).toContain('resolve(STRAPI, ".tmp", "data.db")')
    expect(src).toContain("camis:strapi-schema-check")
    expect(src).not.toContain("migrate")
    expect(src).not.toContain("RolePermissionSeeder")
  })
  it("keeps Laravel-owned state out of the shared database", () => {
    expect(src).toContain('CACHE_STORE: "file"')
    expect(src).toContain('SESSION_DRIVER: "array"')
    expect(src).toContain('QUEUE_CONNECTION: "sync"')
  })
  it("takes JWT_SECRET from the Strapi app's .env and refuses a short one", () => {
    expect(src).toContain('"..", "strapi-oyl"')
    expect(src).toContain('resolve(STRAPI, ".env")')
    expect(src).toContain("length < 32")
  })
})

describe("e2e start-php-backend.mjs", () => {
  const file = resolve(PKG, "..", "e2e-oyl", "scripts", "start-php-backend.mjs")
  const src = readFileSync(file, "utf8")
  it("parses", () => {
    expect(() => execFileSync("node", ["--check", file])).not.toThrow()
  })
  it("boots Strapi first so it owns the schema, then serves PHP on that file", () => {
    expect(src).toContain("start-backend.mjs")
    expect(src).toContain("/_health`")
    expect(src).toContain("'.tmp', 'e2e.db'")
    expect(src).toContain("camis:strapi-schema-check")
    expect(src).not.toContain("migrate")
    expect(src).not.toContain("RolePermissionSeeder")
  })
  it("shares a JWT secret of at least 32 bytes with Strapi", () => {
    const m = src.match(/const JWT_SECRET = '([^']+)'/)
    expect(m).not.toBeNull()
    expect(m![1].length).toBeGreaterThanOrEqual(32)
  })
  it("keeps Laravel-owned state out of the shared database", () => {
    expect(src).toContain("CACHE_STORE: 'file'")
    expect(src).toContain("SESSION_DRIVER: 'array'")
    expect(src).toContain("QUEUE_CONNECTION: 'sync'")
    expect(src).not.toContain("SANCTUM_TOKEN_EXPIRATION")
  })
})
