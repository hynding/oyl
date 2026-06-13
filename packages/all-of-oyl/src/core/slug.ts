import { DomainError } from './domain-error.js'

const SLUG_RE = /^[a-z0-9_]+$/

export function isSlug(value: string): boolean {
  return SLUG_RE.test(value)
}

export function assertSlug(value: string): string {
  if (!isSlug(value)) {
    throw new DomainError('INVALID_SLUG', `not a valid slug: "${value}" (expected [a-z0-9_]+)`)
  }
  return value
}
