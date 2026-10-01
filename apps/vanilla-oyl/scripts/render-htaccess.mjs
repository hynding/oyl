#!/usr/bin/env node
// Render deploy/htaccess.template for a staged index.html.
// Usage: node scripts/render-htaccess.mjs --html <staged index.html> --api-origin <https://host> \
//        [--csp-header Content-Security-Policy|Content-Security-Policy-Report-Only] --out <file>
import { readFile, writeFile } from 'node:fs/promises'
import { hashInlineScripts } from '../deploy/csp-hashes.js'
import { renderHtaccess } from '../deploy/render-htaccess.js'

const args = new Map()
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 2) {
  const k = argv[i], v = argv[i + 1]
  if (!k?.startsWith('--') || v === undefined) {
    console.error(`render-htaccess: bad argument '${k ?? ''}'`)
    process.exit(2)
  }
  args.set(k.slice(2), v)
}
for (const k of ['html', 'api-origin', 'out']) {
  if (!args.get(k)) { console.error(`render-htaccess: --${k} is required`); process.exit(2) }
}

const template = await readFile(new URL('../deploy/htaccess.template', import.meta.url), 'utf8')
const html = await readFile(args.get('html'), 'utf8')
const hashes = await hashInlineScripts(html)
const out = renderHtaccess(template, {
  header: args.get('csp-header') || 'Content-Security-Policy',
  hashes,
  apiOrigin: args.get('api-origin'),
})
await writeFile(args.get('out'), out)
console.log(`render-htaccess: wrote ${args.get('out')} (${hashes.length} inline-script hashes)`)
