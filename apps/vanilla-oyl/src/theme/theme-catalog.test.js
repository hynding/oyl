import { describe, expect, it } from 'vitest'
import { THEMES } from './theme-manager.js'
import { THEME_CATALOG } from './theme-catalog.js'

describe('theme-catalog', () => {
  it('has an entry for every registered theme and nothing else', () => {
    expect(Object.keys(THEME_CATALOG).sort()).toEqual([...THEMES].sort())
  })

  it('gives every theme a label, a tagline, and mode-aware preview colors', () => {
    for (const theme of THEMES) {
      const info = THEME_CATALOG[theme]
      expect(info.label.length, theme).toBeGreaterThan(0)
      expect(info.tagline.length, theme).toBeGreaterThan(0)
      // Previews are light-dark() pairs so swatches track the resolved color-scheme.
      for (const color of [info.preview.bg, info.preview.surface, info.preview.accent]) {
        expect(color, theme).toMatch(/^light-dark\(oklch\(.+\), oklch\(.+\)\)$/)
      }
    }
  })
})
