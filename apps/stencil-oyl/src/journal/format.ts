/** Display unit for known measurement metric keys ('' when unknown). App display logic, as in vanilla. */
export function measurementUnit(metric: string): string {
  const units: Record<string, string> = {
    'body.weight_kg': 'kg',
    'sleep.hours': 'h',
    'screen.minutes': 'min',
  }
  return units[metric] ?? ''
}

/** Known metric keys offered by the composer, plus `custom` for a user-named `custom.*` key. */
export const METRICS = ['body.weight_kg', 'sleep.hours', 'mood.score', 'screen.minutes', 'custom'] as const

/** Vanilla's tag rule: lowercase words with single dashes. */
export const TAG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Split a tags field on whitespace/commas (empties dropped). */
export function parseTags(raw: string): string[] {
  return raw.split(/[\s,]+/).filter(Boolean)
}
