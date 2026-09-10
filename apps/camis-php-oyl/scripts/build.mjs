#!/usr/bin/env node
/**
 * pnpm php-app build — scaffold laravel/ once for the Strapi storage layout (composer
 * create-project + firebase/php-jwt + visus/cuid2, via camis), then camis build + overlay.
 * Safe to re-run: camis build is idempotent and the overlay is mirrored every time. A laravel/
 * scaffolded before the layout switch (Filament/Sanctum, no firebase/php-jwt) is removed and
 * re-scaffolded — it is disposable and git-ignored.
 */
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, rmSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const LARAVEL = resolve(PKG, "laravel")
const COMPOSER_JSON = resolve(LARAVEL, "composer.json")

const run = (args, opts = {}) => {
  const res = spawnSync("pnpm", ["exec", "camis", ...args], {
    cwd: PKG,
    stdio: "inherit",
    ...opts,
  })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

const isStorageScaffold = () =>
  existsSync(COMPOSER_JSON) &&
  readFileSync(COMPOSER_JSON, "utf8").includes('"firebase/php-jwt"')

if (existsSync(COMPOSER_JSON) && !isStorageScaffold()) {
  console.log(
    "[php-app] laravel/ was scaffolded for the Laravel storage layout (no firebase/php-jwt) — removing it and re-scaffolding for the Strapi layout",
  )
  rmSync(LARAVEL, { recursive: true, force: true })
}
if (!existsSync(COMPOSER_JSON)) {
  console.log(
    "[php-app] laravel/ missing — scaffolding (composer create-project; takes a few minutes)",
  )
  run(["scaffold", "filament", "./laravel", "--storage", "strapi"])
}
run(["build"])
console.log("[php-app] built laravel/ (generated + overlay)")
