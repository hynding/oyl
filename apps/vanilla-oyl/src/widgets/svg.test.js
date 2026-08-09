import { describe, expect, it } from 'vitest'
import { ringSvg, sparklineSvg } from './svg.js'

describe('sparklineSvg', () => {
  it('draws one point per value, hidden from a11y tree', () => {
    const svg = sparklineSvg([1, 3, 2])
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    const points = svg.querySelector('polyline')?.getAttribute('points') ?? ''
    expect(points.trim().split(/\s+/)).toHaveLength(3)
    expect(points).not.toContain('NaN')
  })

  it('a flat or empty series never yields NaN', () => {
    expect(sparklineSvg([5, 5, 5]).querySelector('polyline')?.getAttribute('points')).not.toContain('NaN')
    expect(sparklineSvg([]).querySelector('polyline')?.getAttribute('points') ?? '').not.toContain('NaN')
  })
})

describe('ringSvg', () => {
  it('sets the arc dasharray from the clamped ratio', () => {
    const svg = ringSvg(0.5, { size: 48, stroke: 5 })
    const arc = /** @type {SVGCircleElement} */ (svg.querySelectorAll('circle')[1])
    const r = (48 - 5) / 2
    const c = 2 * Math.PI * r
    const [dash] = (arc.getAttribute('stroke-dasharray') ?? '').split(' ').map(Number)
    expect(dash).toBeCloseTo(c * 0.5, 1)
  })

  it('clamps ratios outside [0,1]', () => {
    const over = ringSvg(3).querySelectorAll('circle')[1]
    const under = ringSvg(-1).querySelectorAll('circle')[1]
    const dashOf = (/** @type {Element|undefined} */ el) => Number((el?.getAttribute('stroke-dasharray') ?? '0').split(' ')[0])
    expect(dashOf(over)).toBeGreaterThan(0)
    expect(dashOf(under)).toBe(0)
  })
})
