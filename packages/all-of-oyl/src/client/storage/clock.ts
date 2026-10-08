/**
 * The single source of "now" for the app, so domain calls (which take an explicit
 * asOf/DayKey — the domain has no hidden clock) all read one provider. Swap in tests.
 */
export function now(): Date {
  return new Date()
}

/**
 * The browser's resolved IANA timezone, used to construct per-person roots until a
 * stored User record supplies one.
 */
export function defaultTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}
