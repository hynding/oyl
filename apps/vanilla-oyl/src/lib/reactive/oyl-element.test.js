import { describe, expect, it } from 'vitest'
import { OylElement } from './oyl-element.js'
import { signal } from './signal.js'

class Counter extends OylElement {
  count = signal(0)
  render() {
    const span = document.createElement('span')
    this.bindText(span, () => String(this.count.get()))
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    root.append(span)
  }
}
customElements.define('test-counter', Counter)

describe('OylElement', () => {
  it('renders into a shadow root on connect', () => {
    const el = new Counter()
    document.body.append(el)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    expect(root.querySelector('span')?.textContent).toBe('0')
    el.remove()
  })

  it('updates bound text when a signal changes', async () => {
    const el = new Counter()
    document.body.append(el)
    el.count.set(7)
    await Promise.resolve()
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    expect(root.querySelector('span')?.textContent).toBe('7')
    el.remove()
  })

  it('disposes effects on disconnect (no updates after removal)', async () => {
    const el = new Counter()
    document.body.append(el)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    const span = root.querySelector('span')
    el.remove()
    el.count.set(99)
    await Promise.resolve()
    expect(span?.textContent).toBe('0')
  })
})
