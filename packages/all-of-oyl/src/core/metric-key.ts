import { DomainError } from './domain-error'
import { isSlug } from './slug'

export type MetricKey = string & { readonly __brand: 'MetricKey' }

/**
 * Ownership registry for top-level metric namespaces (see spec, "Extending
 * the app's purpose"). `custom.` is permanently reserved for user-defined
 * metrics and never claimed by a built-in. Claiming a new namespace is a
 * one-line, reviewed change here.
 */
export const KNOWN_NAMESPACES = [
  'activity', 'nutrition', 'finance', 'body', 'sleep', 'mood', 'screen', 'home', 'note',
] as const

/** Namespaces a hand-logged Measurement may write into (phase 2). */
export const MEASUREMENT_NAMESPACES = ['body', 'sleep', 'mood', 'screen', 'home', 'custom'] as const

function of(value: string): MetricKey {
  const segments = value.split('.')
  if (segments.length < 2 || !segments.every(isSlug)) {
    throw new DomainError(
      'INVALID_METRIC_KEY',
      `not a valid metric key: "${value}" (expected 2+ dot-joined [a-z0-9_]+ segments)`,
    )
  }
  return value as MetricKey
}

function namespaceOf(key: MetricKey): string {
  return key.split('.', 1)[0] as string
}

export const MetricKey = { of, namespaceOf }
