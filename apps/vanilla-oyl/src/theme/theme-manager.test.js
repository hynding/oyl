import { describe, expect, it } from 'vitest'
import { resolveColorScheme, nextSettings, THEMES, MODES } from './theme-manager.js'

describe('theme-manager', () => {
  it('exposes the available themes and modes', () => {
    expect(THEMES).toEqual(['classic', 'forest'])
    expect(MODES).toEqual(['system', 'light', 'dark'])
  })

  it('maps mode → color-scheme value', () => {
    expect(resolveColorScheme('system')).toBe('light dark')
    expect(resolveColorScheme('light')).toBe('light')
    expect(resolveColorScheme('dark')).toBe('dark')
  })

  it('updates theme while preserving mode (and vice versa)', () => {
    const a = nextSettings({ theme: 'classic', mode: 'system' }, { theme: 'forest' })
    expect(a).toEqual({ theme: 'forest', mode: 'system' })
    const b = nextSettings(a, { mode: 'dark' })
    expect(b).toEqual({ theme: 'forest', mode: 'dark' })
  })

  it('ignores unknown theme/mode values (keeps current)', () => {
    const s = nextSettings(
      { theme: 'classic', mode: 'light' },
      /** @type {Partial<import('./theme-manager.js').ThemeSettings>} */ (
        /** @type {unknown} */ ({ theme: 'bogus' })
      ),
    )
    expect(s).toEqual({ theme: 'classic', mode: 'light' })
  })
})
