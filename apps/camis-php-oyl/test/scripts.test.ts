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
  it("reads that .env with dotenv semantics: last assignment wins, `export ` and a trailing comment tolerated", () => {
    expect(src, "the last assignment wins").toContain("findLast(")
    expect(src, "an `export ` prefix is part of the syntax").toContain(
      "(?:export\\s+)?",
    )
    expect(
      src,
      "an unquoted trailing comment is not part of the value",
    ).toContain("\\s+#")
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
  it("fails fast when the Strapi child dies instead of hanging the health wait until Playwright times out", () => {
    // A leftover Strapi on the e2e port makes the child exit on EADDRINUSE; the health wait
    // would otherwise poll a port that will never answer 204 for its full timeout.
    expect(src).toContain("const strapiExit = once(strapi, 'exit')")
    expect(src).toContain("Promise.race(")
    expect(src).toContain("await strapiExit")
    // A killed child reports signalCode, not exitCode — both must count as gone.
    expect(src).toContain("exitCode === null")
    expect(src).toContain("signalCode === null")
    // Signal handlers are in place before Strapi is spawned, so a Ctrl-C during its boot
    // still kills it rather than orphaning it.
    const sigterm = src.indexOf("process.on('SIGTERM'")
    const spawnStrapi = src.indexOf("spawn(process.execPath")
    expect(sigterm, "SIGTERM handler").toBeGreaterThan(-1)
    expect(spawnStrapi, "strapi spawn").toBeGreaterThan(-1)
    expect(sigterm).toBeLessThan(spawnStrapi)
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

describe("e2e start-backend.mjs", () => {
  const src = readFileSync(
    resolve(PKG, "..", "e2e-oyl", "scripts", "start-backend.mjs"),
    "utf8",
  )
  it("defers to the JWT_SECRET the PHP starter sets, so both backends sign with the same key", () => {
    expect(src).toContain("process.env.JWT_SECRET ??=")
  })
})

describe(".env.example", () => {
  const src = read(".env.example")
  it("carries the shared-database settings and no Sanctum leftovers", () => {
    expect(src).toContain("JWT_SECRET=")
    expect(src).toContain("CAMIS_EMAIL_CONFIRMATION=false")
    expect(src).toContain("CACHE_STORE=file")
    expect(src).toContain("SESSION_DRIVER=array")
    expect(src).toContain("QUEUE_CONNECTION=sync")
    expect(src).toContain("CAMIS_AUTH_THROTTLE_PER_MINUTE=")
    expect(src).not.toContain("SANCTUM")
  })
  it("carries a JWT_SECRET placeholder of at least 32 characters", () => {
    // A copied .env must not fail the deploy's >= 32-byte gate (or firebase/php-jwt at
    // request time) merely because the placeholder is shorter than a real Strapi secret.
    const line = src
      .split("\n")
      .findLast((l) => l.trim().startsWith("JWT_SECRET="))
    expect(line, "a JWT_SECRET= line").toBeDefined()
    const value = line!
      .trim()
      .slice("JWT_SECRET=".length)
      .replace(/^["']|["']$/g, "")
    expect(value.length).toBeGreaterThanOrEqual(32)
  })
})
