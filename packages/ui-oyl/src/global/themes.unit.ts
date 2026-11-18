import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COLOR_TOKENS } from './contract.js'

const here = import.meta.dirname
const libThemes = join(here, 'themes')

/** The library's eight themes — the source of truth since cutover (apps consume `@oyl/ui-oyl/themes/<name>.css`). */
const THEMES = ['classic', 'ember', 'forest', 'ink', 'lavender', 'ocean', 'paper', 'sunrise']

const themeFiles = () => readdirSync(libThemes).filter((f) => f.endsWith('.css')).sort()
const names = () => themeFiles().map((f) => f.replace(/\.css$/, ''))

describe('theme files', () => {
  it('are exactly the eight registered themes', () => {
    expect(names()).toEqual(THEMES)
  })

  it('each scopes its tokens to :root[data-theme="<its name>"] inside the themes layer', () => {
    for (const file of themeFiles()) {
      const css = readFileSync(join(libThemes, file), 'utf8')
      expect(css, file).toContain('@layer themes')
      expect(css, file).toContain(`:root[data-theme="${file.replace(/\.css$/, '')}"]`)
    }
  })

  it('each declares exactly the 12 color tokens of the contract', () => {
    for (const file of themeFiles()) {
      const css = readFileSync(join(libThemes, file), 'utf8')
      const declared = [...css.matchAll(/(--color-[a-z0-9-]+)\s*:/g)].map((m) => m[1]).sort()
      expect(declared, file).toEqual([...COLOR_TOKENS].sort())
    }
  })
})
