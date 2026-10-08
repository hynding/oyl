import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALL_TOKENS, STRUCTURAL_TOKENS } from './contract.js'

const here = import.meta.dirname
const components = join(here, '..', 'components')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.css')) out.push(p)
  }
  return out
}

describe('tokens.css', () => {
  const css = readFileSync(join(here, 'tokens.css'), 'utf8')

  it('declares the cascade layer order so theme overrides win', () => {
    expect(css.trimStart().startsWith('@layer tokens, themes;')).toBe(true)
  })

  it('declares every structural token', () => {
    for (const name of STRUCTURAL_TOKENS) {
      expect(css, name).toMatch(new RegExp(`${name.replace(/-/g, '\\-')}\\s*:`))
    }
  })
})

describe('component CSS', () => {
  it('references only contract token names', () => {
    const offenders: string[] = []
    for (const file of walk(components)) {
      const css = readFileSync(file, 'utf8')
      for (const m of css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
        if (!ALL_TOKENS.includes(m[1])) offenders.push(`${file.slice(components.length + 1)}: ${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
