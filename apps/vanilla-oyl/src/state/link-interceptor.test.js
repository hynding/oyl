import { describe, expect, it } from 'vitest'
import { interceptLinks } from './link-interceptor.js'

/** A left-click MouseEvent that bubbles and crosses shadow boundaries. */
function clickEvent(init = {}) {
  return new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, button: 0, ...init })
}

describe('interceptLinks', () => {
  it('intercepts a same-origin left-click and calls navigate', () => {
    /** @type {string[]} */ const calls = []
    const stop = interceptLinks(window, (p) => calls.push(p))
    const a = document.createElement('a')
    a.href = '/journal'
    document.body.append(a)
    const e = clickEvent()
    a.dispatchEvent(e)
    expect(calls).toEqual(['/journal'])
    expect(e.defaultPrevented).toBe(true)
    a.remove()
    stop()
  })

  it('preserves the query string', () => {
    /** @type {string[]} */ const calls = []
    const stop = interceptLinks(window, (p) => calls.push(p))
    const a = document.createElement('a')
    a.href = '/journal?seed'
    document.body.append(a)
    a.dispatchEvent(clickEvent())
    expect(calls).toEqual(['/journal?seed'])
    a.remove()
    stop()
  })

  it('ignores modifier-clicks (lets the browser open a new tab)', () => {
    /** @type {string[]} */ const calls = []
    const stop = interceptLinks(window, (p) => calls.push(p))
    const a = document.createElement('a')
    a.href = '/journal'
    document.body.append(a)
    const e = clickEvent({ metaKey: true })
    a.dispatchEvent(e)
    expect(calls).toEqual([])
    expect(e.defaultPrevented).toBe(false)
    a.remove()
    stop()
  })

  it('ignores target, download, and rel="external" anchors', () => {
    /** @type {string[]} */ const calls = []
    const stop = interceptLinks(window, (p) => calls.push(p))
    /** @type {Array<(a: HTMLAnchorElement) => void>} */
    const mutations = [
      (a) => { a.target = '_blank' },
      (a) => { a.setAttribute('download', '') },
      (a) => { a.setAttribute('rel', 'external') },
    ]
    for (const mutate of mutations) {
      const a = document.createElement('a')
      a.href = '/journal'
      mutate(a)
      document.body.append(a)
      a.dispatchEvent(clickEvent())
      a.remove()
    }
    expect(calls).toEqual([])
    stop()
  })

  it('ignores cross-origin links', () => {
    /** @type {string[]} */ const calls = []
    const stop = interceptLinks(window, (p) => calls.push(p))
    const a = document.createElement('a')
    a.href = 'https://example.com/x'
    document.body.append(a)
    a.dispatchEvent(clickEvent())
    expect(calls).toEqual([])
    a.remove()
    stop()
  })

  it('finds the anchor across a shadow boundary', () => {
    /** @type {string[]} */ const calls = []
    const stop = interceptLinks(window, (p) => calls.push(p))
    const host = document.createElement('div')
    document.body.append(host)
    const root = host.attachShadow({ mode: 'open' })
    const a = document.createElement('a')
    a.href = '/vault'
    root.append(a)
    a.dispatchEvent(clickEvent())
    expect(calls).toEqual(['/vault'])
    host.remove()
    stop()
  })

  it('stop() removes the listener', () => {
    /** @type {string[]} */ const calls = []
    const stop = interceptLinks(window, (p) => calls.push(p))
    stop()
    const a = document.createElement('a')
    a.href = '/journal'
    document.body.append(a)
    a.dispatchEvent(clickEvent())
    expect(calls).toEqual([])
    a.remove()
  })
})
