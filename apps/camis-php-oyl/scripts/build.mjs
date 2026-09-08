#!/usr/bin/env node
/**
 * pnpm php-app build — scaffold laravel/ once (composer create-project + Filament + install:api
 * + Spatie, via camis), then overlay the generated app. Safe to re-run: camis build is
 * idempotent and the overlay is mirrored every time.
 */
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const LARAVEL = resolve(PKG, "laravel")

const run = (args, opts = {}) => {
  const res = spawnSync("pnpm", ["exec", "camis", ...args], {
    cwd: PKG,
    stdio: "inherit",
    ...opts,
  })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

if (!existsSync(resolve(LARAVEL, "composer.json"))) {
  console.log(
    "[php-app] laravel/ missing — scaffolding (composer create-project; takes a few minutes)",
  )
  run(["scaffold", "filament", "./laravel"])
}
run(["build"])
console.log("[php-app] built laravel/ (generated + overlay)")
