import { describe, it, expect } from 'vitest'
import { utf8Encode } from './utf8.js'

describe('utf8Encode', () => {
  it('matches TextEncoder for ascii, 2-byte, 3-byte and astral characters', () => {
    const reference = new TextEncoder()
    for (const s of ['plain', 'receipt Müller.pdf', '日本語ファイル.png', 'emoji 🧾.jpg', '']) {
      expect(Array.from(utf8Encode(s))).toEqual(Array.from(reference.encode(s)))
    }
  })
})
