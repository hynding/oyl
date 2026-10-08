import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Every ui-* tag any component renders must be registered by the global script. */
describe('global script registers every ui-* element the app renders', () => {
  it('covers the tags used in src/components', () => {
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs')
    const root = join(import.meta.dirname, '..', 'components')
    const used = new Set<string>()
    const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n.endsWith('.tsx') && !n.endsWith('.spec.tsx')) for (const m of readFileSync(p, 'utf8').matchAll(/<(ui-[a-z-]+)/g)) used.add(m[1]) } }
    walk(root)
    const global = readFileSync(join(import.meta.dirname, 'app.ts'), 'utf8')
    const toFn = (tag: string) => 'defineCustomElement' + tag.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('') + '()'
    const missing = [...used].filter((tag) => !global.includes(toFn(tag)))
    expect(missing).toEqual([])
  })
})
