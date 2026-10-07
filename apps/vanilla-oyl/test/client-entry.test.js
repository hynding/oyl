import { describe, expect, it } from 'vitest'
// @ts-ignore node types
import { readFile } from 'node:fs/promises'
// @ts-ignore node types
import { fileURLToPath } from 'node:url'
// @ts-ignore node types
import { dirname, join } from 'node:path'

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
