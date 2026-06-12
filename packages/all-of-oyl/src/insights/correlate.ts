// packages/all-of-oyl/src/insights/correlate.ts
import { DayRange } from '../core/day-range'
import type { AggregateKind, Journal } from '../core/journal'
import type { MetricKey } from '../core/metric-key'

/** Days both series have data must reach this for an honest answer. */
const MIN_OVERLAPPING_DAYS = 3

/**
 * Pearson correlation over per-day values of two metrics ("does mood track
 * sleep?"). Each day's value is the metric's daily aggregate; `kinds`
 * supplies the per-metric aggregation (default 'sum') — gauge metrics like
 * mood want 'avg', or two scores in one day corrupt the series. Returns
 * undefined when it cannot honestly answer: fewer than 3 overlapping
 * days-with-data, or zero variance in either series.
 */
export function correlate(
  journal: Journal,
  metricA: MetricKey,
  metricB: MetricKey,
  range: DayRange,
  kinds?: { a?: AggregateKind; b?: AggregateKind },
): number | undefined {
  const pairs: [number, number][] = []
  for (const day of range) {
    const single = DayRange.of(day, day)
    const a = journal.aggregate(metricA, single, kinds?.a ?? 'sum')
    const b = journal.aggregate(metricB, single, kinds?.b ?? 'sum')
    if (a === undefined || b === undefined) continue
    pairs.push([a, b])
  }
  if (pairs.length < MIN_OVERLAPPING_DAYS) return undefined

  const n = pairs.length
  const meanA = pairs.reduce((sum, [a]) => sum + a, 0) / n
  const meanB = pairs.reduce((sum, [, b]) => sum + b, 0) / n
  let cov = 0
  let varA = 0
  let varB = 0
  for (const [a, b] of pairs) {
    cov += (a - meanA) * (b - meanB)
    varA += (a - meanA) ** 2
    varB += (b - meanB) ** 2
  }
  if (varA === 0 || varB === 0) return undefined
  return cov / Math.sqrt(varA * varB)
}
