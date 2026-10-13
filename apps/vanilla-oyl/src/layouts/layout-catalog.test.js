import { describe, expect, it } from 'vitest'
import { LAYOUTS, DEFAULT_LAYOUT, isLayoutId, byId, ORIENTATION } from './layout-catalog.js'

describe('layout catalog', () => {
  it('has classic as the default and first entry', () => {
    expect(DEFAULT_LAYOUT).toBe('classic')
    expect(LAYOUTS[0]?.id).toBe('classic')
  })

  it('every descriptor is frozen and complete', () => {
    for (const l of LAYOUTS) {
      expect(Object.isFrozen(l), l.id).toBe(true)
      expect(typeof l.label).toBe('string')
      expect(typeof l.description).toBe('string')
      expect(['top', 'side', 'floating']).toContain(l.navMode)
      expect(['rail', 'band', 'none']).toContain(l.widgets)
      expect(['classic', 'wide']).toContain(l.pageWidth)
      expect(l.styles).toBeInstanceOf(CSSStyleSheet)
    }
  })

  it('registers exactly the seven layouts in picker order', () => {
    expect(LAYOUTS.map((l) => l.id)).toEqual([
      'classic', 'sidebar', 'workspace', 'dashboard', 'focus', 'studio', 'wide',
    ])
  })

  it('descriptor values match the spec table', () => {
    const table = /** @type {Record<string, [string, string, string]>} */ ({
      classic: ['top', 'none', 'classic'],
      sidebar: ['side', 'rail', 'wide'],
      workspace: ['side', 'rail', 'wide'],
      dashboard: ['top', 'band', 'classic'],
      focus: ['floating', 'none', 'classic'],
      studio: ['side', 'band', 'wide'],
      wide: ['top', 'none', 'wide'],
    })
    for (const l of LAYOUTS) {
      expect([l.navMode, l.widgets, l.pageWidth], l.id).toEqual(table[l.id])
    }
  })

  it('ids are unique', () => {
    expect(new Set(LAYOUTS.map((l) => l.id)).size).toBe(LAYOUTS.length)
  })

  it('isLayoutId accepts every catalog id and rejects everything else', () => {
    for (const l of LAYOUTS) expect(isLayoutId(l.id)).toBe(true)
    expect(isLayoutId('cyberpunk')).toBe(false)
    expect(isLayoutId(undefined)).toBe(false)
    expect(isLayoutId(7)).toBe(false)
  })

  it('byId falls back to classic for unknown ids', () => {
    expect(byId('nope').id).toBe('classic')
    expect(byId('classic').id).toBe('classic')
  })

  it('maps every navMode to a nav orientation', () => {
    expect(ORIENTATION).toEqual({ top: 'horizontal', side: 'vertical', floating: 'horizontal' })
  })

  it('classic keeps the current frame contract', () => {
    const classic = byId('classic')
    expect(classic.navMode).toBe('top')
    expect(classic.widgets).toBe('none')
    expect(classic.pageWidth).toBe('classic')
  })

  it('workspace degrades its aside inside the desktop scope, never outside it', () => {
    // The three-column frame only has room above ~1100px; below that the aside
    // rejoins the nav rail. That fallback is a NESTED @media, so the structural
    // desktop-scope test above still holds. Assert it survived parsing.
    const [desktop] = /** @type {CSSMediaRule[]} */ ([...byId('workspace').styles.cssRules])
    const nested = /** @type {CSSMediaRule[]} */ ([...(desktop?.cssRules ?? [])]).filter((r) => 'conditionText' in r)
    expect(nested.map((r) => r.conditionText)).toEqual(['(max-width: 1099px)'])
  })

  it('studio nests its transparency and motion fallbacks inside the desktop scope', () => {
    // Glass surfaces and the entry reveal are both opt-out-able, and @keyframes has
    // to live somewhere: all three are NESTED at-rules, so the structural
    // desktop-scope test below still holds. Assert they survived parsing.
    const [desktop] = /** @type {CSSMediaRule[]} */ ([...byId('studio').styles.cssRules])
    const nested = [...(desktop?.cssRules ?? [])].filter((r) => !(r instanceof CSSStyleRule))
    const conditions = nested.map((r) => ('conditionText' in r ? r.conditionText : r.constructor.name))
    expect(conditions).toContain('(prefers-reduced-transparency: reduce)')
    expect(conditions).toContain('(prefers-reduced-motion: no-preference)')
  })

  it('every layout sheet rule is scoped to desktop (min-width: 641px)', () => {
    for (const l of LAYOUTS) {
      for (const rule of l.styles.cssRules) {
        const media = /** @type {CSSMediaRule} */ (rule)
        expect('conditionText' in media, `${l.id}: "${rule.cssText.slice(0, 60)}" must be an @media rule`).toBe(true)
        expect(media.conditionText).toBe('(min-width: 641px)')
      }
    }
  })
})
