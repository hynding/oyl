import { describe, expect, it } from 'vitest'
import { SETTINGS_KEY } from '@oyl/all-of-oyl/client'
import { THEMES, MODES, THEME_CATALOG, resolveColorScheme, nextSettings, createThemeApplier, createThemeState, type ThemeSettings } from './theme.js'

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed))
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) }
}

describe('theme manager', () => {
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
    expect(nextSettings(a, { mode: 'dark' })).toEqual({ theme: 'forest', mode: 'dark' })
  })
  it('ignores unknown theme/mode values (keeps current)', () => {
    const s = nextSettings({ theme: 'classic', mode: 'light' }, { theme: 'bogus' } as unknown as Partial<ThemeSettings>)
    expect(s).toEqual({ theme: 'classic', mode: 'light' })
  })
})

describe('createThemeApplier', () => {
  function fakeDoc({ withViewTransition = true } = {}) {
    const transitions: string[] = []
    const doc: any = { documentElement: { dataset: {}, style: {} } }
    if (withViewTransition) doc.startViewTransition = (cb: () => void) => { transitions.push(doc.documentElement.dataset.theme ?? '(unset)'); cb() }
    return { doc, transitions }
  }
  it('applies instantly on first call, cross-fades afterwards', () => {
    const { doc, transitions } = fakeDoc()
    const apply = createThemeApplier(doc, { prefersReducedMotion: () => false })
    apply({ theme: 'classic', mode: 'system' })
    expect(doc.documentElement.dataset.theme).toBe('classic')
    expect(transitions).toEqual([])
    apply({ theme: 'ink', mode: 'dark' })
    expect(doc.documentElement.dataset.theme).toBe('ink')
    expect(doc.documentElement.style.colorScheme).toBe('dark')
    expect(transitions).toEqual(['classic'])
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

describe('theme catalog', () => {
  it('has an entry for every registered theme and nothing else, with mode-aware previews', () => {
    expect(Object.keys(THEME_CATALOG).sort()).toEqual([...THEMES].sort())
    for (const theme of THEMES) {
      const info = THEME_CATALOG[theme]
      expect(info.label.length, theme).toBeGreaterThan(0)
      expect(info.tagline.length, theme).toBeGreaterThan(0)
      for (const color of [info.preview.bg, info.preview.surface, info.preview.accent]) {
        expect(color, theme).toMatch(/^light-dark\(oklch\(.+\), oklch\(.+\)\)$/)
      }
    }
  })
  it('matches vanilla catalog previews (the themes are shared)', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const vanilla = readFileSync(join(import.meta.dirname, '..', '..', '..', 'vanilla-oyl', 'src', 'theme', 'theme-catalog.js'), 'utf8')
    for (const theme of THEMES) for (const c of Object.values(THEME_CATALOG[theme].preview)) expect(vanilla, theme).toContain(c)
  })
})

describe('theme state', () => {
  it('defaults when storage is empty', () => {
    expect(createThemeState(fakeStorage()).settings.get()).toEqual({ theme: 'classic', mode: 'system' })
  })
  it('hydrates from stored settings', () => {
    const storage = fakeStorage({ [SETTINGS_KEY]: JSON.stringify({ theme: 'forest', mode: 'dark' }) })
    expect(createThemeState(storage).settings.get()).toEqual({ theme: 'forest', mode: 'dark' })
  })
  it('update() persists and updates the signal', () => {
    const storage = fakeStorage()
    const state = createThemeState(storage)
    state.update({ theme: 'forest' })
    expect(state.settings.get().theme).toBe('forest')
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!).theme).toBe('forest')
  })
  it('update() preserves unknown settings keys (e.g. layout) in the stored blob', () => {
    const storage = fakeStorage({ [SETTINGS_KEY]: JSON.stringify({ theme: 'forest', mode: 'dark', layout: 'sidebar' }) })
    const state = createThemeState(storage)
    state.update({ theme: 'ink' })
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!)).toEqual({ theme: 'ink', mode: 'dark', layout: 'sidebar' })
  })
  it('update() merges from RAW storage, not the normalized signal', () => {
    const storage = fakeStorage()
    const state = createThemeState(storage)
    storage.setItem(SETTINGS_KEY, JSON.stringify({ layout: 'focus' }))
    state.update({ mode: 'light' })
    const stored = JSON.parse(storage.getItem(SETTINGS_KEY)!)
    expect(stored.layout).toBe('focus')
    expect(stored.mode).toBe('light')
  })
  it('refresh() re-reads storage', () => {
    const storage = fakeStorage()
    const state = createThemeState(storage)
    storage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'ember', mode: 'system' }))
    state.refresh()
    expect(state.settings.get().theme).toBe('ember')
  })
})
