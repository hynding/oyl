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

  it('normalises CRLF to LF before hashing, as the browser does when parsing', async () => {
    const lf = '<head>\n<script>\n  a()\n  b()\n</script>\n</head>'
    const crlf = lf.replace(/\n/g, '\r\n')
    const [lfHash] = await hashInlineScripts(lf)
    const [crlfHash] = await hashInlineScripts(crlf)
    expect(crlfHash).toBe(lfHash)
  })

  it('returns [] when there is no inline script', async () => {
    expect(await hashInlineScripts('<html><script src="/a.js"></script></html>')).toEqual([])
  })

  it('tolerates quoted > inside attribute values', async () => {
    const [hash1] = await hashInlineScripts('<script data-foo="a>b">x</script>')
    const [hash2] = await hashInlineScripts('<script>x</script>')
    expect(hash1).toBe(hash2)
  })

  it('distinguishes data-src from src attribute', async () => {
    const [dataHash] = await hashInlineScripts('<script data-src="/x.js">x</script>')
    const [withXHash] = await hashInlineScripts('<script>x</script>')
    const noHash = await hashInlineScripts('<script src="/x.js"></script>')
    expect(dataHash).toBe(withXHash)
    expect(noHash).toEqual([])
  })

  it('is case-insensitive for script tags', async () => {
    const [hash1] = await hashInlineScripts('<SCRIPT>x</SCRIPT>')
    const [hash2] = await hashInlineScripts('<script>x</script>')
    expect(hash1).toBe(hash2)
  })

  it('ignores src= inside quoted attribute values', async () => {
    const [quotedHash] = await hashInlineScripts('<script data-log="tracking src= enabled">x</script>')
    const [plainHash] = await hashInlineScripts('<script>x</script>')
    expect(quotedHash).toBe(plainHash)
    const noHash = await hashInlineScripts('<script data-a="b" src="/x.js"></script>')
    expect(noHash).toEqual([])
  })
})
