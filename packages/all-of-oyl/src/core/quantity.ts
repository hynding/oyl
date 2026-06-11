import { DomainError } from './domain-error'

export class Quantity {
  readonly amount: number
  readonly unit: string

  private constructor(amount: number, unit: string) {
    this.amount = amount
    this.unit = unit
  }

  static of(amount: number, unit: string): Quantity {
    if (!Number.isFinite(amount)) {
      throw new DomainError('INVALID_QUANTITY', `amount must be finite, got ${amount}`)
    }
    if (unit.length === 0) {
      throw new DomainError('INVALID_QUANTITY', 'unit must be a non-empty string')
    }
    return new Quantity(amount, unit)
  }

  private assertSameUnit(other: Quantity): void {
    if (this.unit !== other.unit) {
      throw new DomainError('UNIT_MISMATCH', `cannot combine ${this.unit} with ${other.unit}`)
    }
  }

  add(other: Quantity): Quantity {
    this.assertSameUnit(other)
    return new Quantity(this.amount + other.amount, this.unit)
  }

  subtract(other: Quantity): Quantity {
    this.assertSameUnit(other)
    return new Quantity(this.amount - other.amount, this.unit)
  }

  equals(other: Quantity): boolean {
    return this.amount === other.amount && this.unit === other.unit
  }

  toJSON(): { amount: number; unit: string } {
    return { amount: this.amount, unit: this.unit }
  }

  static fromJSON(shape: unknown): Quantity {
    const s = shape as { amount?: unknown; unit?: unknown }
    if (typeof s?.amount !== 'number' || typeof s?.unit !== 'string') {
      throw new DomainError('MALFORMED_JSON', 'not a Quantity shape')
    }
    return Quantity.of(s.amount, s.unit)
  }
}
