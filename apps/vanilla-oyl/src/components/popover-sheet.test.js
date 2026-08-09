import { describe, expect, it } from 'vitest'
import { MOBILE_SHEET_CSS } from './popover-sheet.js'
import { sheet } from './sheet.js'

describe('MOBILE_SHEET_CSS', () => {
  it('is a single max-width 640px media block making .panel a fixed sheet', () => {
    const s = sheet(MOBILE_SHEET_CSS)
    expect(s.cssRules).toHaveLength(1)
    const media = /** @type {CSSMediaRule} */ (s.cssRules[0])
    expect(media.conditionText).toBe('(max-width: 640px)')
    const text = [...media.cssRules].map((r) => r.cssText).join('\n')
    expect(text).toContain('.panel')
    expect(text).toContain('position: fixed')
  })
})
