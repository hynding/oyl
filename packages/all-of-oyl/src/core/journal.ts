import { DayKey, assertTimezone } from './day-key'
import { DayRange } from './day-range'
import { DomainError } from './domain-error'
import type { Entry } from './entry'
import type { Id } from './id'
import { MetricKey } from './metric-key'

export type AggregateKind = 'sum' | 'avg' | 'last'

/**
 * One person's record of what happened. Constructed with an explicit IANA
 * timezone — the one place the timezone decision lives. A plain in-memory
 * aggregate: apps hydrate it from their repositories.
 */
export class Journal {
  private readonly tz: string
  /** Insertion order is the documented tie-break for 'last'. */
  private readonly entries: Entry[] = []
  private readonly byId = new Set<Id>()

  constructor(tz: string) {
    this.tz = assertTimezone(tz)
  }

  add(entry: Entry): void {
    if (this.byId.has(entry.id)) {
      throw new DomainError('DUPLICATE_ID', `entry already in journal: ${entry.id}`)
    }
    this.byId.add(entry.id)
    this.entries.push(entry)
  }

  /** Idempotent — removing a missing id is a no-op. */
  remove(id: Id): void {
    if (!this.byId.delete(id)) return
    const index = this.entries.findIndex((e) => e.id === id)
    this.entries.splice(index, 1)
  }

  dayOf(entry: Entry): DayKey {
    return DayKey.from(entry.occurredAt, this.tz)
  }

  entriesOn(day: DayKey): readonly Entry[] {
    return this.entries.filter((e) => this.dayOf(e).equals(day))
  }

  entriesIn(range: DayRange): readonly Entry[] {
    return this.entries.filter((e) => range.contains(this.dayOf(e)))
  }

  span(): DayRange | undefined {
    const first = this.entries[0]
    if (!first) return undefined
    let min = this.dayOf(first)
    let max = min
    for (const e of this.entries) {
      const d = this.dayOf(e)
      if (d.compare(min) < 0) min = d
      if (d.compare(max) > 0) max = d
    }
    return DayRange.of(min, max)
  }

  /**
   * The single aggregation path. Returns undefined when no entry in range
   * carries the metric. 'sum' is flat; 'avg' is two-stage (within-day mean,
   * then mean across days-with-data); 'last' is the value at the latest
   * occurredAt, insertion order breaking ties — per the spec's
   * counters-vs-gauges rule.
   */
  aggregate(metric: MetricKey, range: DayRange, kind: AggregateKind): number | undefined {
    if (kind === 'last') {
      let best: { at: number; index: number; value: number } | undefined
      this.entries.forEach((entry, index) => {
        if (!range.contains(this.dayOf(entry))) return
        const value = entry.metrics().get(metric)
        if (value === undefined) return
        const at = entry.occurredAt.getTime()
        if (!best || at > best.at || (at === best.at && index > best.index)) {
          best = { at, index, value }
        }
      })
      return best?.value
    }

    const perDay = new Map<string, number[]>()
    for (const entry of this.entriesIn(range)) {
      const value = entry.metrics().get(metric)
      if (value === undefined) continue
      const dayValue = this.dayOf(entry).value
      const bucket = perDay.get(dayValue)
      if (bucket) bucket.push(value)
      else perDay.set(dayValue, [value])
    }
    if (perDay.size === 0) return undefined

    if (kind === 'sum') {
      let total = 0
      for (const values of perDay.values()) for (const v of values) total += v
      return total
    }
    // 'avg': two-stage
    let dayTotal = 0
    for (const values of perDay.values()) {
      dayTotal += values.reduce((a, b) => a + b, 0) / values.length
    }
    return dayTotal / perDay.size
  }

  totalOf(metric: MetricKey, range: DayRange): number {
    return this.aggregate(metric, range, 'sum') ?? 0
  }

  totalsByPrefix(prefix: string, range: DayRange): ReadonlyMap<MetricKey, number> {
    const totals = new Map<MetricKey, number>()
    for (const entry of this.entriesIn(range)) {
      for (const [key, value] of entry.metrics()) {
        if (key !== prefix && !key.startsWith(`${prefix}.`)) continue
        totals.set(key, (totals.get(key) ?? 0) + value)
      }
    }
    return totals
  }
}
