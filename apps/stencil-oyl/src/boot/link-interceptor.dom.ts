import { describe, expect, it } from 'vitest'
import { interceptLinks } from './link-interceptor.js'

const clickEvent = (init: MouseEventInit = {}) =>
  new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, button: 0, ...init })

function withAnchor(href: string, mutate: (a: HTMLAnchorElement) => void = () => {}) {
  const a = document.createElement('a')
  a.href = href
  mutate(a)
  document.body.append(a)
  return a
}

describe('interceptLinks', () => {
  it('intercepts a same-origin left-click and calls navigate (query preserved)', () => {
    const calls: string[] = []
    const stop = interceptLinks(window, (p) => calls.push(p))
    const a = withAnchor('/journal?seed')
    const e = clickEvent()
    a.dispatchEvent(e)
    expect(calls).toEqual(['/journal?seed'])
    expect(e.defaultPrevented).toBe(true)
    a.remove(); stop()
  })

  it('ignores modifier-clicks (lets the browser open a new tab)', () => {
    const calls: string[] = []
    const stop = interceptLinks(window, (p) => calls.push(p))
    const a = withAnchor('/journal')
    const e = clickEvent({ metaKey: true })
    a.dispatchEvent(e)
    expect(calls).toEqual([])
    expect(e.defaultPrevented).toBe(false)
    a.remove(); stop()
  })

  it('ignores target, download, and rel="external" anchors', () => {
    const calls: string[] = []
    const stop = interceptLinks(window, (p) => calls.push(p))
    for (const mutate of [(a: HTMLAnchorElement) => { a.target = '_blank' }, (a: HTMLAnchorElement) => a.setAttribute('download', ''), (a: HTMLAnchorElement) => a.setAttribute('rel', 'external')]) {
      const a = withAnchor('/journal', mutate)
      a.dispatchEvent(clickEvent())
      a.remove()
    }
    expect(calls).toEqual([])
    stop()
  })

  it('ignores cross-origin links', () => {
    const calls: string[] = []
    const stop = interceptLinks(window, (p) => calls.push(p))
    const a = withAnchor('https://example.com/x')
    a.dispatchEvent(clickEvent())
    expect(calls).toEqual([])
    a.remove(); stop()
  })

  it('finds the anchor across a shadow boundary', () => {
    const calls: string[] = []
    const stop = interceptLinks(window, (p) => calls.push(p))
    const host = document.createElement('div')
    document.body.append(host)
    const a = document.createElement('a')
    a.href = '/vault'
    host.attachShadow({ mode: 'open' }).append(a)
    a.dispatchEvent(clickEvent())
    expect(calls).toEqual(['/vault'])
    host.remove(); stop()
  })

  it('stop() removes the listener', () => {
    const calls: string[] = []
    interceptLinks(window, (p) => calls.push(p))()
    const a = withAnchor('/journal')
    a.dispatchEvent(clickEvent())
    expect(calls).toEqual([])
    a.remove()
  })
})
