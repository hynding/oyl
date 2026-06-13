// Fails if any emitted dist/ file imports a bare specifier (anything not starting
// with './' or '../'). The app's importmap has exactly one entry and relies on every
// internal import being relative; a stray bare import (e.g. 'rrule') would break it.
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const DIST = new URL('../dist/', import.meta.url).pathname
const IMPORT_RE = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/g
const offenders = []

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await walk(full)
    else if (entry.name.endsWith('.js')) {
      const code = await readFile(full, 'utf8')
      for (const m of code.matchAll(IMPORT_RE)) {
        const spec = m[1]
        if (!spec.startsWith('./') && !spec.startsWith('../')) offenders.push(`${full}: ${spec}`)
      }
    }
  }
}

await walk(DIST)
if (offenders.length) {
  console.error('Bare-specifier imports found in dist/ (breaks the single-entry importmap):')
  for (const o of offenders) console.error('  ' + o)
  process.exit(1)
}
console.log('dist/ is bare-import free.')
