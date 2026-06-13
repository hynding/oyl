import { DomainError } from './domain-error.js'

// Platform global (Node 19+/browsers/edge); typed locally because the src tsconfig restricts `types` to vitest/globals.
declare const crypto: { randomUUID(): string }

export type Id = string & { readonly __brand: 'Id' }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function create(): Id {
  return crypto.randomUUID() as Id
}

function of(value: string): Id {
  if (!UUID_RE.test(value)) {
    throw new DomainError('INVALID_ID', `not a valid id: "${value}"`)
  }
  return value as Id
}

export const Id = { create, of }
