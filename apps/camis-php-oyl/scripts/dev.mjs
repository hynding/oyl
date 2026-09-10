#!/usr/bin/env node
/**
 * pnpm php-app dev — serve the generated app on :1340 (the client's DEFAULT_API_BASE_URL)
 * against the Strapi dev database (apps/strapi-oyl/.tmp/data.db). Strapi owns the schema: run
 * `pnpm strapi-app develop` once (it creates the file, the tables and the roles), stop it, then
 * run this. Never run both on :1340 at once. JWT_SECRET is read from apps/strapi-oyl/.env so a
 * session minted by either backend works on the other.
 */
import { spawn, spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const LARAVEL = resolve(PKG, "laravel")
const STRAPI = resolve(PKG, "..", "strapi-oyl")
const DB = resolve(STRAPI, ".tmp", "data.db")
const PORT = 1340

/**
 * Read `name` out of apps/strapi-oyl/.env the way dotenv does: the LAST assignment wins, an
 * `export ` prefix is part of the syntax, a quoted value ends at its closing quote, and an
 * unquoted trailing ` # comment` is not part of the value.
 */
const strapiEnv = (name) => {
  const file = resolve(STRAPI, ".env")
  if (!existsSync(file)) return undefined
  const assignment = new RegExp(String.raw`^\s*(?:export\s+)?${name}=`)
  const line = readFileSync(file, "utf8")
    .split("\n")
    .findLast((l) => assignment.test(l))
  if (line === undefined) return undefined
  const raw = line.replace(assignment, "").trim()
  const quoted = raw.match(/^(["'])([\s\S]*?)\1/)
  return quoted ? quoted[2] : raw.replace(/\s+#.*$/, "").trim()
}

if (!existsSync(resolve(LARAVEL, "artisan"))) {
  console.error("[php-app] laravel/ not built — run `pnpm php-app build` first")
  process.exit(1)
}
if (!existsSync(DB)) {
  console.error(
    "[php-app] apps/strapi-oyl/.tmp/data.db missing — run `pnpm strapi-app develop` once (Strapi creates the schema and roles), stop it, then retry",
  )
  process.exit(1)
}
const jwtSecret = strapiEnv("JWT_SECRET") ?? ""
if (jwtSecret.length < 32) {
  console.error(
    "[php-app] apps/strapi-oyl/.env needs JWT_SECRET of at least 32 bytes (shared with this app; firebase/php-jwt refuses shorter HS256 keys)",
  )
  process.exit(1)
}

const env = {
  ...process.env,
  APP_ENV: "local",
  DB_CONNECTION: "sqlite",
  DB_DATABASE: DB,
  JWT_SECRET: jwtSecret,
  CAMIS_EMAIL_CONFIRMATION: "false",
  CACHE_STORE: "file",
  SESSION_DRIVER: "array",
  QUEUE_CONNECTION: "sync",
}

const check = spawnSync("php", ["artisan", "camis:strapi-schema-check"], {
  cwd: LARAVEL,
  env,
  stdio: "inherit",
})
if (check.status !== 0) {
  console.error(
    "[php-app] schema check failed — the Strapi dev database is missing tables; run `pnpm strapi-app develop` once after any schema change",
  )
  process.exit(check.status ?? 1)
}

console.log(
  `[php-app] http://localhost:${PORT}/api  (db: apps/strapi-oyl/.tmp/data.db)`,
)
const server = spawn(
  "php",
  ["artisan", "serve", "--host=127.0.0.1", `--port=${PORT}`],
  { cwd: LARAVEL, env, stdio: "inherit" },
)
process.on("SIGINT", () => server.kill("SIGINT"))
server.on("exit", (code) => process.exit(code ?? 0))
