import { describe, it, expect } from 'vitest'
import { hashInlineScripts } from './csp-hashes.js'

// SHA-256 of the empty string, base64 — the one vector everyone can verify by hand.
const EMPTY = 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='

describe('hashInlineScripts', () => {
  it('hashes each inline script body in document order and ignores <script src>', async () => {
    const html = [
      '<script></script>',
      '<script type="module" src="/src/main.js"></script>',
      '<script type="importmap">{"imports":{}}</script>',
    ].join('\n')
    const hashes = await hashInlineScripts(html)
    expect(hashes).toHaveLength(2)
    expect(hashes[0]).toBe(EMPTY)
    expect(hashes[1]).toMatch(/^sha256-[A-Za-z0-9+/]{43}=$/)
    expect(hashes[1]).not.toBe(EMPTY)
  })

  it('hashes the body exactly as written (whitespace matters to the browser)', async () => {
    const [a] = await hashInlineScripts('<script>\n  x\n</script>')
    const [b] = await hashInlineScripts('<script>x</script>')
    expect(a).not.toBe(b)
  })

  it('returns [] when there is no inline script', async () => {
    expect(await hashInlineScripts('<html><script src="/a.js"></script></html>')).toEqual([])
  })
})
