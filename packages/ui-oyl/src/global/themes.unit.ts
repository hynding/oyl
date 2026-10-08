import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COLOR_TOKENS } from './contract.js'

const here = import.meta.dirname
const libThemes = join(here, 'themes')
const repoRoot = join(here, '..', '..', '..', '..')
const vanillaThemes = join(repoRoot, 'apps', 'vanilla-oyl', 'styles', 'themes')
const themeManager = join(repoRoot, 'apps', 'vanilla-oyl', 'src', 'theme', 'theme-manager.js')

const themeFiles = () => readdirSync(libThemes).filter((f) => f.endsWith('.css')).sort()
const names = () => themeFiles().map((f) => f.replace(/\.css$/, ''))

/** Vanilla's THEMES registry, read from source so this test has no DOM dependency. */
function vanillaThemeNames(): string[] {
  const src = readFileSync(themeManager, 'utf8')
  const m = src.match(/export const THEMES = [^(]*\(\[([\s\S]*?)\]\)/)
  if (!m) throw new Error('THEMES registry not found in theme-manager.js')
  return [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]).sort()
}

describe('theme files', () => {
  it('cover exactly the themes vanilla registers', () => {
    expect(names()).toEqual(vanillaThemeNames())
  })

  it('each declares exactly the 12 color tokens of the contract', () => {
    for (const file of themeFiles()) {
      const css = readFileSync(join(libThemes, file), 'utf8')
      const declared = [...css.matchAll(/(--color-[a-z0-9-]+)\s*:/g)].map((m) => m[1]).sort()
      expect(declared, file).toEqual([...COLOR_TOKENS].sort())
    }
  })

  it('each is byte-equal to its vanilla twin (until cutover retires vanilla)', () => {
    for (const file of themeFiles()) {
      const lib = readFileSync(join(libThemes, file), 'utf8')
      const vanilla = readFileSync(join(vanillaThemes, file), 'utf8')
      expect(lib, file).toBe(vanilla)
    }
  })
})
