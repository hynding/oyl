const NS = 'http://www.w3.org/2000/svg'

/** @param {string} tag @param {Record<string, string>} attrs */
function el(tag, attrs) {
  const node = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}

/**
 * Tiny trend line. Decorative (aria-hidden) — the widget's text carries the
 * values. Themed via currentColor. Flat/empty series draw a midline.
 * @param {readonly number[]} values @param {{ width?: number, height?: number }} [opts]
 * @returns {SVGSVGElement}
 */
export function sparklineSvg(values, { width = 120, height = 28 } = {}) {
  const pad = 2
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spanY = max - min
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0
  const points = values
    .map((v, i) => {
      const x = pad + i * stepX
      const y = spanY === 0 ? height / 2 : pad + (height - pad * 2) * (1 - (v - min) / spanY)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const svg = /** @type {SVGSVGElement} */ (
    el('svg', { width: String(width), height: String(height), viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' })
  )
  svg.append(el('polyline', { points, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linejoin': 'round' }))
  return svg
}

/**
 * Progress ring. Decorative (aria-hidden) — the widget's text carries the
 * value. Track at low opacity, arc via stroke-dasharray, ratio clamped [0,1].
 * @param {number} ratio @param {{ size?: number, stroke?: number }} [opts]
 * @returns {SVGSVGElement}
 */
export function ringSvg(ratio, { size = 48, stroke = 5 } = {}) {
  const clamped = Math.max(0, Math.min(1, ratio))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const center = String(size / 2)
  const svg = /** @type {SVGSVGElement} */ (
    el('svg', { width: String(size), height: String(size), viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true' })
  )
  const base = { cx: center, cy: center, r: String(r), fill: 'none', 'stroke-width': String(stroke) }
  svg.append(el('circle', { ...base, stroke: 'currentColor', opacity: '0.15' }))
  svg.append(
    el('circle', {
      ...base,
      stroke: 'var(--color-accent)',
      'stroke-dasharray': `${(c * clamped).toFixed(2)} ${c.toFixed(2)}`,
      'stroke-linecap': 'round',
      transform: `rotate(-90 ${center} ${center})`,
    }),
  )
  return svg
}
