import { DayKey } from '../core/day-key.js'

/** All fixture dates are relative to this anchor — never the wall clock. */
export const FIXTURE_TODAY = DayKey.of('2026-06-01')

/** DST-rich on purpose; fixture data straddles the 2026-03-08 transition. */
export const FIXTURE_TZ = 'America/New_York'
