import { describe, expect, it } from 'vitest'
import { resolveColorScheme, nextSettings, createThemeApplier, THEMES, MODES } from './theme-manager.js'

describe('theme-manager', () => {
  it('exposes the available themes and modes', () => {
    expect(THEMES).toEqual(['classic', 'forest', 'sunrise', 'ocean', 'lavender', 'ember', 'ink', 'paper'])
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

describe('createThemeApplier', () => {
  /** A fake document exposing just what the applier touches. */
  function fakeDoc({ withViewTransition = true } = {}) {
    /** @type {string[]} */
    const transitions = []
    const doc = /** @type {any} */ ({
      documentElement: { dataset: {}, style: {} },
    })
    if (withViewTransition) {
      doc.startViewTransition = (/** @type {() => void} */ cb) => {
        transitions.push(doc.documentElement.dataset.theme ?? '(unset)')
        cb()
      }
    }
    return { doc, transitions }
  }

  it('applies instantly on first call, cross-fades afterwards', () => {
    const { doc, transitions } = fakeDoc()
    const apply = createThemeApplier(doc, { prefersReducedMotion: () => false })
    apply({ theme: 'classic', mode: 'system' })
    expect(doc.documentElement.dataset.theme).toBe('classic')
    expect(transitions).toEqual([]) // boot paint is never animated
    apply({ theme: 'ink', mode: 'dark' })
    expect(doc.documentElement.dataset.theme).toBe('ink')
    expect(doc.documentElement.style.colorScheme).toBe('dark')
    expect(transitions).toEqual(['classic']) // second apply went through a view transition
  })

  it('applies instantly when reduced motion is preferred or the API is missing', () => {
    const reduced = fakeDoc()
    const applyReduced = createThemeApplier(reduced.doc, { prefersReducedMotion: () => true })
    applyReduced({ theme: 'classic', mode: 'system' })
    applyReduced({ theme: 'ocean', mode: 'system' })
    expect(reduced.doc.documentElement.dataset.theme).toBe('ocean')
    expect(reduced.transitions).toEqual([])

    const legacy = fakeDoc({ withViewTransition: false })
    const applyLegacy = createThemeApplier(legacy.doc, { prefersReducedMotion: () => false })
    applyLegacy({ theme: 'classic', mode: 'system' })
    applyLegacy({ theme: 'paper', mode: 'light' })
    expect(legacy.doc.documentElement.dataset.theme).toBe('paper')
  })
})
