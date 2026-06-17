import { describe, expect, it } from 'vitest'
import { stalenessLabel } from './format.js'

describe('stalenessLabel', () => {
  it('phrases never / today / yesterday / longer gaps', () => {
    expect(stalenessLabel(undefined)).toBe('Never contacted')
    expect(stalenessLabel(0)).toBe('Last contacted today')
    expect(stalenessLabel(1)).toBe('Last contacted yesterday')
    expect(stalenessLabel(95)).toBe('Last contacted 3 months ago')
  })
})
