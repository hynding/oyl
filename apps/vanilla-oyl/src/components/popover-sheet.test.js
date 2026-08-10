import { describe, expect, it } from 'vitest'
import { MOBILE_SHEET_CSS, closeOnOutside } from './popover-sheet.js'
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

describe('closeOnOutside', () => {
  function harness() {
    const host = document.createElement('div')
    const panel = document.createElement('div')
    panel.hidden = false
    document.body.append(host)
    let open = true
    const controller = new AbortController()
    closeOnOutside(host, panel, (v) => { open = v; panel.hidden = !v }, controller.signal)
    return { host, panel, isOpen: () => open, controller }
  }

  it.each(['pointerdown', 'focusin'])('closes on outside %s', (type) => {
    const { isOpen, controller } = harness()
    document.body.dispatchEvent(new Event(type, { bubbles: true, composed: true }))
    expect(isOpen()).toBe(false)
    controller.abort()
  })

  it.each(['pointerdown', 'focusin'])('ignores inside %s (composedPath contains host)', (type) => {
    const { host, isOpen, controller } = harness()
    host.dispatchEvent(new Event(type, { bubbles: true, composed: true }))
    expect(isOpen()).toBe(true)
    controller.abort()
  })

  it('does nothing when the panel is already hidden', () => {
    const { panel, isOpen, controller } = harness()
    panel.hidden = true
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }))
    expect(isOpen()).toBe(true) // setOpen never called
    controller.abort()
  })

  it('stops listening after the signal aborts', () => {
    const { controller, panel, isOpen } = harness()
    controller.abort()
    panel.hidden = false
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }))
    expect(isOpen()).toBe(true)
  })
})
