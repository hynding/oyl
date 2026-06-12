import { Id } from '../core/id'

/**
 * Stable, hand-assigned fixture ids: 00000000-0000-4000-8000-<n, 12 digits>.
 * Reserve blocks per domain as fixtures grow:
 *   1-9 users · 10-29 life areas · 30-49 catalogs · 50-69 goals/budgets ·
 *   70-99 reserved · 100-999 entries
 *   1000-1999 plans · 2000-2999 vault · 3000+ sharing
 */
export function fixtureId(n: number): Id {
  return Id.of(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`)
}
