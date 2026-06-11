export type DomainErrorCode =
  | 'INVALID_ID'
  | 'INVALID_SLUG'
  | 'INVALID_METRIC_KEY'
  | 'RESERVED_NAMESPACE'
  | 'INVALID_QUANTITY'
  | 'UNIT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'INVALID_RANGE'
  | 'INVALID_DAY'
  | 'INVALID_TIMEZONE'
  | 'ILLEGAL_TRANSITION'
  | 'DUPLICATE_ID'
  | 'REVISION_CONFLICT'
  | 'MALFORMED_JSON'
  | 'UNKNOWN_KIND'

export class DomainError extends Error {
  readonly code: DomainErrorCode

  constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}
