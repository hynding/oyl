import { describe, expect, it } from 'vitest'
import { inlineConfirm } from './confirm.js'

describe('inlineConfirm', () => {
  it('focuses the No button when it opens (keyboard continuity)', () => {
    const mount = document.createElement('span')
    document.body.append(mount)
    inlineConfirm({ mount, prompt: 'Delete?', lifecycle: new AbortController().signal, onYes: () => {}, restore: () => {} })
    expect(mount.querySelector('[data-act="confirm-no"]')).toBe(document.activeElement)
    mount.remove()
  })

  it('renders the prompt and both actions', () => {
    const mount = document.createElement('span')
    document.body.append(mount)
    inlineConfirm({ mount, prompt: 'Remove it?', lifecycle: new AbortController().signal, onYes: () => {}, restore: () => {} })
    expect(mount.querySelector('[data-act="confirm-yes"]')).toBeTruthy()
    expect(mount.querySelector('[data-act="confirm-no"]')).toBeTruthy()
    expect(mount.textContent).toContain('Remove it?')
    mount.remove()
  })
})
