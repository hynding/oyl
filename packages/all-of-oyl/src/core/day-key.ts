import { DomainError } from './domain-error'

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

const FORMATTERS = new Map<string, Intl.DateTimeFormat>()

function formatterFor(tz: string): Intl.DateTimeFormat {
  const cached = FORMATTERS.get(tz)
  if (cached) return cached
  let formatter: Intl.DateTimeFormat
  try {
    // en-CA formats as YYYY-MM-DD
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    throw new DomainError('INVALID_TIMEZONE', `unknown IANA timezone: "${tz}"`)
  }
  FORMATTERS.set(tz, formatter)
  return formatter
}

export function assertTimezone(tz: string): string {
  formatterFor(tz)
  return tz
}

export class DayKey {
  readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  /** Bucket an instant into a calendar day in an explicit IANA timezone. */
  static from(instant: Date, tz: string): DayKey {
    return new DayKey(formatterFor(tz).format(instant))
  }

  static of(value: string): DayKey {
    const m = DAY_RE.exec(value)
    if (!m) throw new DomainError('INVALID_DAY', `not a valid day: "${value}"`)
    const year = Number(m[1])
    const month = Number(m[2])
    const day = Number(m[3])
    // Round-trip through UTC to reject impossible dates like 2026-02-30
    const probe = new Date(Date.UTC(year, month - 1, day))
    if (
      probe.getUTCFullYear() !== year ||
      probe.getUTCMonth() !== month - 1 ||
      probe.getUTCDate() !== day
    ) {
      throw new DomainError('INVALID_DAY', `no such day: "${value}"`)
    }
    return new DayKey(value)
  }

  static fromJSON(value: string): DayKey {
    return DayKey.of(value)
  }

  private toUTC(): Date {
    const [y, m, d] = this.value.split('-').map(Number) as [number, number, number]
    return new Date(Date.UTC(y, m - 1, d))
  }

  addDays(n: number): DayKey {
    const utc = this.toUTC()
    utc.setUTCDate(utc.getUTCDate() + n)
    const y = utc.getUTCFullYear()
    const m = String(utc.getUTCMonth() + 1).padStart(2, '0')
    const d = String(utc.getUTCDate()).padStart(2, '0')
    return new DayKey(`${y}-${m}-${d}`)
  }

  /** ISO weekday: Monday = 1 … Sunday = 7. */
  weekday(): number {
    const sundayBased = this.toUTC().getUTCDay() // 0=Sun … 6=Sat
    return sundayBased === 0 ? 7 : sundayBased
  }

  compare(other: DayKey): number {
    return this.value < other.value ? -1 : this.value > other.value ? 1 : 0
  }

  equals(other: DayKey): boolean {
    return this.value === other.value
  }

  toJSON(): string {
    return this.value
  }
}
