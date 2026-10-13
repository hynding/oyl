import { describe, expect, it } from 'vitest'
// @ts-expect-error -- vanilla typechecks without Node types; test-only Node import
import { readFile, readdir } from 'node:fs/promises'
// @ts-expect-error -- vanilla typechecks without Node types; test-only Node import
import { fileURLToPath } from 'node:url'
// @ts-expect-error -- vanilla typechecks without Node types; test-only Node import
import { dirname, join } from 'node:path'
import { OylElement } from '../src/lib/reactive/oyl-element.js'
import { signal } from '@oyl/all-of-oyl/client'

describe('@oyl/all-of-oyl/client entry', () => {
  it('resolves through the package exports map', async () => {
    const mod = await import('@oyl/all-of-oyl/client')
    expect(typeof mod).toBe('object')
  })

  it('is mapped in the browser importmap and preloaded (unit tests resolve via exports, the browser only via importmap)', async () => {
    const dir = dirname(fileURLToPath(import.meta.url))
    const html = await readFile(join(dir, '../index.html'), 'utf8')
    expect(html).toContain('"@oyl/all-of-oyl/client": "/vendor/all-of-oyl/client/index.js"')
    expect(html).toContain('<link rel="modulepreload" href="/vendor/all-of-oyl/client/index.js" />')
  })
})

class SharedProbe extends OylElement {
  value = signal('a')
  render() {
    const span = document.createElement('span')
    this.bindText(span, () => this.value.get())
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    root.append(span)
  }
}
customElements.define('test-shared-probe', SharedProbe)

describe('one reactive core', () => {
  it('an OylElement re-renders from a signal created by @oyl/all-of-oyl/client', async () => {
    const el = new SharedProbe()
    document.body.append(el)
    el.value.set('b')
    await Promise.resolve()
    expect(/** @type {ShadowRoot} */ (el.shadowRoot).querySelector('span')?.textContent).toBe('b')
    el.remove()
  })

  it('vanilla keeps no local reactive core and never deep-imports client internals', async () => {
    const testDir = dirname(fileURLToPath(import.meta.url))
    const reactiveDir = join(testDir, '../src/lib/reactive')
    expect((await readdir(reactiveDir)).filter((/** @type {string} */ f) => !f.startsWith('oyl-element.'))).toEqual([])
    const srcDir = join(testDir, '../src')
    /** @type {string[]} */
    const offenders = []
    for (const rel of await readdir(srcDir, { recursive: true })) {
      if (!rel.endsWith('.js')) continue
      const text = await readFile(join(srcDir, rel), 'utf8')
      if (/all-of-oyl\/client\/[\w./-]+/.test(text)) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})
