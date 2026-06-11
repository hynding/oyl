import { DayKey } from './day-key'
import { DomainError } from './domain-error'

export type CadenceUnit = 'days' | 'weeks' | 'months' | 'years'

const UNITS: readonly CadenceUnit[] = ['days', 'weeks', 'months', 'years']

function parts(day: DayKey): { y: number; m: number; d: number } {
  const [y, m, d] = day.value.split('-').map(Number) as [number, number, number]
  return { y, m, d }
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** k-th occurrence from the anchor; month/year occurrences clamp independently. */
function occurrence(anchor: DayKey, n: number, unit: CadenceUnit, k: number): DayKey {
  if (unit === 'days') return anchor.addDays(k * n)
  if (unit === 'weeks') return anchor.addDays(k * n * 7)
  const { y, m, d } = parts(anchor)
  const monthStep = unit === 'months' ? k * n : k * n * 12
  const total = (m - 1) + monthStep
  const year = y + Math.floor(total / 12)
  const month = (total % 12) + 1
  const day = Math.min(d, daysInMonth(year, month))
  return DayKey.of(
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  )
}

export class Cadence {
  readonly n: number
  readonly unit: CadenceUnit

  private constructor(n: number, unit: CadenceUnit) {
    this.n = n
    this.unit = unit
  }

  static of(n: number, unit: CadenceUnit): Cadence {
    if (!Number.isInteger(n) || n < 1) {
      throw new DomainError('INVALID_QUANTITY', `cadence n must be an integer >= 1, got ${n}`)
    }
    return new Cadence(n, unit)
  }

  /** First anchored occurrence on or after asOf. Anchor-based: never drifts. */
  nextOnOrAfter(anchor: DayKey, asOf: DayKey): DayKey {
    if (asOf.compare(anchor) <= 0) return anchor
    // Estimate k, then walk to the exact first occurrence >= asOf.
    let k = 1
    if (this.unit === 'days' || this.unit === 'weeks') {
      const span = this.unit === 'days' ? this.n : this.n * 7
      const diffDays = Math.round(
        (Date.parse(`${asOf.value}T00:00:00Z`) - Date.parse(`${anchor.value}T00:00:00Z`)) / 86_400_000,
      )
      k = Math.max(1, Math.ceil(diffDays / span))
    } else {
      const a = parts(anchor)
      const b = parts(asOf)
      const monthsPerStep = this.unit === 'months' ? this.n : this.n * 12
      const diffMonths = (b.y - a.y) * 12 + (b.m - a.m)
      k = Math.max(1, Math.floor(diffMonths / monthsPerStep))
    }
    while (occurrence(anchor, this.n, this.unit, k).compare(asOf) < 0) k += 1
    while (k > 1 && occurrence(anchor, this.n, this.unit, k - 1).compare(asOf) >= 0) k -= 1
    return occurrence(anchor, this.n, this.unit, k)
  }

  /** Sugar for deliberate re-anchoring (duty cadences): next occurrence strictly after day. */
  nextAfter(day: DayKey): DayKey {
    return this.nextOnOrAfter(day, day.addDays(1))
  }

  equals(other: Cadence): boolean {
    return this.n === other.n && this.unit === other.unit
  }

  toJSON(): { n: number; unit: CadenceUnit } {
    return { n: this.n, unit: this.unit }
  }

  static fromJSON(shape: unknown): Cadence {
    const s = shape as { n?: unknown; unit?: unknown }
    if (typeof s?.n !== 'number' || !UNITS.includes(s?.unit as CadenceUnit)) {
      throw new DomainError('MALFORMED_JSON', 'not a Cadence shape')
    }
    return Cadence.of(s.n, s.unit as CadenceUnit)
  }
}
