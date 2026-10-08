import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = import.meta.dirname

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|css|html)$/.test(name)) out.push(p)
  }
  return out
}

describe('ui-oyl is domain-agnostic', () => {
  it('never imports @oyl/all-of-oyl', () => {
    const offenders = walk(src)
      .filter((f) => !f.endsWith('agnostic.unit.ts'))
      .filter((f) => readFileSync(f, 'utf8').includes('@oyl/all-of-oyl'))
    expect(offenders).toEqual([])
  })
})
