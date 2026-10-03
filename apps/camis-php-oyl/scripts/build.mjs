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
// The PHP that DreamHost runs (web and CLI) and that CI builds with. composer.lock is resolved
// against this, not the build machine's PHP: a Mac on 8.4 would otherwise lock Symfony 8.1
// (php >= 8.4.1), which `composer install` on the host refuses.
const PROD_PHP = "8.3.0"

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

const composer = (args) => {
  const res = spawnSync("composer", [...args, "--no-interaction"], { cwd: LARAVEL, stdio: "inherit" })
  if (res.status !== 0) process.exit(res.status ?? 1)
}
const pinned = JSON.parse(readFileSync(COMPOSER_JSON, "utf8")).config?.platform?.php
if (pinned !== PROD_PHP) {
  console.log(`[php-app] pinning composer platform php ${PROD_PHP} (the production PHP) and re-resolving composer.lock`)
  composer(["config", "platform.php", PROD_PHP])
  composer(["update", "--no-audit"])
}
run(["build"])
console.log("[php-app] built laravel/ (generated + overlay)")
