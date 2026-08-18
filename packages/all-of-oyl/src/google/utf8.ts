/**
 * Minimal UTF-8 encoder. The browser-build tsconfig has NO DOM lib, so
 * TextEncoder is not available in src/ — this replaces it for multipart bodies.
 */
export function utf8Encode(s: string): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < s.length; i++) {
    let cp = s.codePointAt(i) as number
    if (cp > 0xffff) i++ // consumed a surrogate pair
    if (cp <= 0x7f) out.push(cp)
    else if (cp <= 0x7ff) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f))
    else if (cp <= 0xffff) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
  }
  return Uint8Array.from(out)
}
