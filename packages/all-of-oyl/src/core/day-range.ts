import { DayKey } from './day-key'
import { DomainError } from './domain-error'

export class DayRange {
  readonly start: DayKey
  readonly end: DayKey

  private constructor(start: DayKey, end: DayKey) {
    this.start = start
    this.end = end
  }

  static of(start: DayKey, end: DayKey): DayRange {
    if (end.compare(start) < 0) {
      throw new DomainError('INVALID_RANGE', `range end ${end.value} precedes start ${start.value}`)
    }
    return new DayRange(start, end)
  }

  contains(day: DayKey): boolean {
    return day.compare(this.start) >= 0 && day.compare(this.end) <= 0
  }

  /** Inclusive day count — a single-day range is 1. */
  lengthInDays(): number {
    const startUtc = Date.UTC(this.start.year, this.start.month - 1, this.start.dayOfMonth)
    const endUtc = Date.UTC(this.end.year, this.end.month - 1, this.end.dayOfMonth)
    return Math.round((endUtc - startUtc) / 86_400_000) + 1
  }

  *[Symbol.iterator](): Iterator<DayKey> {
    for (let day = this.start; day.compare(this.end) <= 0; day = day.addDays(1)) {
      yield day
    }
  }

  equals(other: DayRange): boolean {
    return this.start.equals(other.start) && this.end.equals(other.end)
  }
}
