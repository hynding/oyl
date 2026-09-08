#!/usr/bin/env node
/**
 * pnpm php-app dev — serve the generated app on :1340 (the client's DEFAULT_API_BASE_URL)
 * with a dev SQLite. Never run together with `pnpm strapi-app develop` (same port).
 * First run migrates + seeds the role; `--fresh` wipes the database first.
 */
import { spawn, spawnSync } from "node:child_process"
import { existsSync, rmSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const LARAVEL = resolve(PKG, "laravel")
const DB = resolve(LARAVEL, "database", "dev.sqlite")
const PORT = 1340
const env = {
  ...process.env,
  DB_CONNECTION: "sqlite",
  DB_DATABASE: DB,
  APP_ENV: "local",
}

if (!existsSync(resolve(LARAVEL, "artisan"))) {
  console.error("[php-app] laravel/ not built — run `pnpm php-app build` first")
  process.exit(1)
}
if (process.argv.includes("--fresh")) rmSync(DB, { force: true })
const fresh = !existsSync(DB)
if (fresh) {
  spawnSync("touch", [DB])
  for (const args of [
    ["migrate", "--force"],
    ["db:seed", "--class=RolePermissionSeeder", "--force"],
  ]) {
    const r = spawnSync("php", ["artisan", ...args], {
      cwd: LARAVEL,
      env,
      stdio: "inherit",
    })
    if (r.status !== 0) process.exit(r.status ?? 1)
  }
}
console.log(
  `[php-app] http://localhost:${PORT}/api  (db: laravel/database/dev.sqlite)`,
)
const server = spawn(
  "php",
  ["artisan", "serve", "--host=127.0.0.1", `--port=${PORT}`],
  { cwd: LARAVEL, env, stdio: "inherit" },
)
process.on("SIGINT", () => server.kill("SIGINT"))
server.on("exit", (code) => process.exit(code ?? 0))
