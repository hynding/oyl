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

/**
 * Derive a valid slug from free text (lowercase, non-[a-z0-9] runs → single `_`,
 * trimmed). Total loss (e.g. all-symbol input) falls back to `item` so the result
 * always satisfies `isSlug` — callers can pass user-facing names directly.
 */
export function toSlug(value: string): string {
  const s = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return s === '' ? 'item' : s
}
