#!/usr/bin/env node
// Render an app's deploy/htaccess.template for a staged index.html (CSP inline-script hashes +
// the API origin). Shared by scripts/dreamhost/publish-www.sh for whichever app it ships.
// Usage: node scripts/dreamhost/render-htaccess.mjs --template <htaccess.template> \
//        --html <staged index.html> --api-origin <https://host> \
//        [--csp-header Content-Security-Policy|Content-Security-Policy-Report-Only] --out <file>
import { readFile, writeFile } from 'node:fs/promises'
import { hashInlineScripts } from './lib/csp-hashes.mjs'
import { renderHtaccess } from './lib/render-htaccess.mjs'

const args = new Map()
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 2) {
  const k = argv[i], v = argv[i + 1]
  if (!k?.startsWith('--') || v === undefined) {
    console.error(`render-htaccess: bad argument '${k ?? ''}'`)
    process.exit(2)
  }
  if (v.startsWith('--')) {
    console.error(`render-htaccess: ${k} needs a value`)
    process.exit(2)
  }
  const name = k.slice(2)
  if (args.has(name)) {
    console.error(`render-htaccess: duplicate argument --${name}`)
    process.exit(2)
  }
  args.set(name, v)
}
for (const k of ['template', 'html', 'api-origin', 'out']) {
  if (!args.get(k)) { console.error(`render-htaccess: --${k} is required`); process.exit(2) }
}

const template = await readFile(args.get('template'), 'utf8')
const html = await readFile(args.get('html'), 'utf8')
const hashes = await hashInlineScripts(html)
const out = renderHtaccess(template, {
  header: args.get('csp-header') || 'Content-Security-Policy',
  hashes,
  apiOrigin: args.get('api-origin'),
})
await writeFile(args.get('out'), out)
console.log(`render-htaccess: wrote ${args.get('out')} (${hashes.length} inline-script hashes)`)
