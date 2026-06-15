import { describe, expect, it, beforeAll, vi } from 'vitest'
import { createNoticeState } from '../state/notice.js'
import { defineNotice } from './oyl-notice.js'

beforeAll(() => defineNotice())

describe('<oyl-notice>', () => {
  it('shows the message when the signal is set; dismiss calls onDismiss', async () => {
    const n = createNoticeState(); n.show('Sync failed')
    const onDismiss = vi.fn()
    const el = /** @type {any} */ (document.createElement('oyl-notice'))
    el.notice = n.notice
    el.onDismiss = onDismiss
    document.body.append(el)
    await Promise.resolve()
    expect(el.shadowRoot.textContent).toContain('Sync failed')
    const btn = /** @type {HTMLButtonElement} */ (el.shadowRoot.querySelector('button[data-act="dismiss"]'))
    btn.click()
    expect(onDismiss).toHaveBeenCalled()
    el.remove()
  })

  it('renders nothing visible when the signal is null', async () => {
    const n = createNoticeState()
    const el = /** @type {any} */ (document.createElement('oyl-notice'))
    el.notice = n.notice
    el.onDismiss = () => {}
    document.body.append(el)
    await Promise.resolve()
    const alert = el.shadowRoot.querySelector('[role="alert"]')
    // hidden (or absent) when no notice
    expect(alert == null || alert.hidden === true).toBe(true)
    el.remove()
  })
})
