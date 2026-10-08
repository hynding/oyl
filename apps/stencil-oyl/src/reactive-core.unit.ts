import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = import.meta.dirname

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

/**
 * Exactly one reactive core may load (two tracking contexts = screens silently stop
 * updating). `signal`/`computed`/`effect` come only from `@oyl/all-of-oyl/client`.
 */
describe('one reactive core', () => {
  it('imports signal/computed/effect only from @oyl/all-of-oyl/client', () => {
    const offenders: string[] = []
    for (const file of walk(src)) {
      if (file.endsWith('reactive-core.unit.ts')) continue
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
        const names = m[1].split(',').map((n) => n.trim().split(/\s+as\s+/)[0])
        if (names.some((n) => ['signal', 'computed', 'effect'].includes(n)) && m[2] !== '@oyl/all-of-oyl/client') {
          offenders.push(`${file.slice(src.length + 1)}: ${m[2]}`)
        }
      }
      if (/\b(?:function|const)\s+(?:signal|effect|computed)\b/.test(text)) offenders.push(`${file.slice(src.length + 1)}: defines a reactive primitive`)
      if (/@oyl\/all-of-oyl\/client\//.test(text)) offenders.push(`${file.slice(src.length + 1)}: deep import`)
    }
    expect(offenders).toEqual([])
  })
})
