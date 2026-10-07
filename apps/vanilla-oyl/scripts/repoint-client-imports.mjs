#!/usr/bin/env node
// One-off codemod for the client-layer extraction (spec 2026-10-06-extract-client-layer).
// Rewrites every quoted relative specifier in vanilla's src/, test/, deploy/ that resolves to
// one of the given (already-moved) files into '@oyl/all-of-oyl/client'. Covers `from '…'`,
// JSDoc `import('…')` types, and dynamic imports alike. Deleted in the plan's final task.
// Usage (from repo root): node apps/vanilla-oyl/scripts/repoint-client-imports.mjs src/lib/reactive/signal.js …
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const moved = new Set(process.argv.slice(2).map((p) => resolve(root, p)))
if (moved.size === 0) {
  console.error('usage: repoint-client-imports.mjs <old path relative to apps/vanilla-oyl>…')
  process.exit(1)
}

/** @param {string} dir @returns {AsyncGenerator<string>} */
async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (/\.m?js$/.test(e.name)) yield p
  }
}

const SPEC = /(['"])(\.\.?\/[^'"\n]+?\.js)\1/g
let changed = 0
for (const dir of ['src', 'test', 'deploy']) {
  for await (const file of walk(join(root, dir))) {
    const before = await readFile(file, 'utf8')
    const after = before.replace(SPEC, (m, q, spec) =>
      moved.has(resolve(dirname(file), spec)) ? `${q}@oyl/all-of-oyl/client${q}` : m)
    if (after !== before) {
      await writeFile(file, after)
      changed++
      console.log('repointed', relative(root, file))
    }
  }
}
console.log(`${changed} file(s) changed`)
