import type { Units } from '../user/user.js'

const LB_PER_KG = 2.2046226218

/** "72.5 kg" (metric, 1 dp, trailing zero trimmed) or "160 lb" (imperial, whole). */
export function formatWeight(kg: number, units: Units): string {
  if (units === 'imperial') return `${Math.round(kg * LB_PER_KG)} lb`
  return `${Number((Math.round(kg * 10) / 10).toFixed(1)).toString()} kg`
}

/** "178 cm" (metric, whole) or "5 ft 10 in" (imperial, carrying 12in up). */
export function formatHeight(cm: number, units: Units): string {
  if (units !== 'imperial') return `${Math.round(cm)} cm`
  const totalIn = cm / 2.54
  let ft = Math.floor(totalIn / 12)
  let inch = Math.round(totalIn - ft * 12)
  if (inch === 12) { ft += 1; inch = 0 }
  return `${ft} ft ${inch} in`
}

/** Whole years between two YYYY-MM-DD civil dates (no timezone). */
export function age(birthday: string, today: string): number {
  const bp = birthday.split('-').map(Number)
  const tp = today.split('-').map(Number)
  const by = bp[0] as number, bm = bp[1] as number, bd = bp[2] as number
  const ty = tp[0] as number, tm = tp[1] as number, td = tp[2] as number
  let years = ty - by
  if (tm < bm || (tm === bm && td < bd)) years -= 1
  return years
}
