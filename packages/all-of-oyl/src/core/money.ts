import { DomainError } from './domain-error.js'

export class Money {
  readonly minor: number
  readonly currency: string
  readonly exponent: number

  private constructor(minor: number, currency: string, exponent: number) {
    this.minor = minor
    this.currency = currency
    this.exponent = exponent
  }

  static of(minor: number, currency: string, exponent = 2): Money {
    if (!Number.isInteger(minor)) {
      throw new DomainError('INVALID_QUANTITY', `minor units must be an integer, got ${minor}`)
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new DomainError('INVALID_QUANTITY', `not an ISO currency code: "${currency}"`)
    }
    if (!Number.isInteger(exponent) || exponent < 0 || exponent > 4) {
      throw new DomainError('INVALID_QUANTITY', `exponent must be an integer in [0, 4], got ${exponent}`)
    }
    return new Money(minor, currency, exponent)
  }

  static usd(minor: number): Money {
    return Money.of(minor, 'USD', 2)
  }

  /** Round a major-unit number back to exact minor units (the Budget seam). */
  static fromMajor(major: number, currency: string, exponent = 2): Money {
    return Money.of(Math.round(major * 10 ** exponent), currency, exponent)
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency || this.exponent !== other.exponent) {
      throw new DomainError('CURRENCY_MISMATCH', `cannot combine ${this.currency} with ${other.currency}`)
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other)
    return new Money(this.minor + other.minor, this.currency, this.exponent)
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other)
    return new Money(this.minor - other.minor, this.currency, this.exponent)
  }

  /** Major units, for metric emission only — never for arithmetic. */
  toNumber(): number {
    return this.minor / 10 ** this.exponent
  }

  equals(other: Money): boolean {
    return this.minor === other.minor && this.currency === other.currency && this.exponent === other.exponent
  }

  toJSON(): { minor: number; currency: string; exponent: number } {
    return { minor: this.minor, currency: this.currency, exponent: this.exponent }
  }

  static fromJSON(shape: unknown): Money {
    const s = shape as { minor?: unknown; currency?: unknown; exponent?: unknown }
    if (typeof s?.minor !== 'number' || typeof s?.currency !== 'string' || typeof s?.exponent !== 'number') {
      throw new DomainError('MALFORMED_JSON', 'not a Money shape')
    }
    return Money.of(s.minor, s.currency, s.exponent)
  }
}
