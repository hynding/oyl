import type { User } from '@oyl/all-of-oyl'
import { defaultTimezone, type ProfilePatch } from '@oyl/all-of-oyl/client'
import { age, formatHeight, formatWeight } from '@oyl/all-of-oyl/format'
import type { SelectOption } from '@oyl/ui-oyl'

export type Units = 'metric' | 'imperial'
export const KG_PER_LB = 0.45359237
export const CM_PER_IN = 2.54
export const OTHER = '__other__'
export const GENDERS: readonly string[] = ['female', 'male', 'non-binary', 'prefer not to say']
export const GENDER_OPTIONS: readonly SelectOption[] = [{ value: '', label: '—' }, ...GENDERS.map((g) => ({ value: g, label: g })), { value: OTHER, label: 'Other' }]
export const UNIT_OPTIONS: readonly SelectOption[] = [{ value: 'metric', label: 'Metric (kg, cm)' }, { value: 'imperial', label: 'Imperial (lb, ft/in)' }]

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** The editable slice of a profile (vanilla's `toPatch`): optional fields only when set. */
export function toPatch(u: User): ProfilePatch {
  const p: ProfilePatch = { displayName: u.displayName, timezone: u.timezone, defaultCurrency: u.defaultCurrency }
  for (const k of ['units', 'birthday', 'weightKg', 'heightCm', 'gender', 'location'] as const) {
    const v = u[k]
    if (v !== undefined) (p as Record<string, unknown>)[k] = v
  }
  return p
}

/** "81.5 kg · 180 cm · 36 yrs" from the present parts, in the stored units; "" when none. */
export function bodySummary(profile: User | null, today: string): string {
  if (!profile) return ''
  const units: Units = profile.units ?? 'metric'
  const parts: string[] = []
  if (profile.weightKg != null) parts.push(formatWeight(profile.weightKg, units))
  if (profile.heightCm != null) parts.push(formatHeight(profile.heightCm, units))
  if (profile.birthday && today) parts.push(`${age(profile.birthday, today)} yrs`)
  return parts.join(' · ')
}

/**
 * Select options for the IANA zones; a current value absent from the list (`UTC`, aliases such
 * as `Asia/Calcutta`) is kept as its own first option so a save never silently rewrites it.
 * `null` zones → no select (text fallback).
 */
export function timezoneOptions(zones: readonly string[] | null, current: string): SelectOption[] | null {
  if (!zones) return null
  const list = current && !zones.includes(current) ? [current, ...zones] : zones
  return list.map((z) => ({ value: z, label: z }))
}

export interface FormSeed {
  timezone: string
  units: Units
  birthday: string
  weight: string
  height: string
  gender: string
  genderOther: string
  location: string
}

/** Field values from a patch: body numbers shown in the stored units, custom gender → Other + text. */
export function seedFrom(value: ProfilePatch): FormSeed {
  const units: Units = value.units ?? 'metric'
  const show = (n: number | undefined, factor: number) => (n == null ? '' : String(units === 'imperial' ? round1(n / factor) : n))
  const gender = value.gender ?? ''
  const custom = gender !== '' && !GENDERS.includes(gender)
  return {
    timezone: value.timezone ?? defaultTimezone(),
    units,
    birthday: value.birthday ?? '',
    weight: show(value.weightKg, KG_PER_LB),
    height: show(value.heightCm, CM_PER_IN),
    gender: custom ? OTHER : gender,
    genderOther: custom ? gender : '',
    location: value.location ?? '',
  }
}

/** Vanilla's `getValues()`: timezone + units always; the rest only when non-empty and valid. */
export function readPatch(f: FormSeed): ProfilePatch {
  const patch: ProfilePatch = { timezone: f.timezone, units: f.units }
  if (f.birthday) patch.birthday = f.birthday
  const num = (s: string) => { const n = Number(s); return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : undefined }
  const w = num(f.weight)
  if (w !== undefined) patch.weightKg = f.units === 'imperial' ? round1(w * KG_PER_LB) : w
  const h = num(f.height)
  if (h !== undefined) patch.heightCm = f.units === 'imperial' ? round1(h * CM_PER_IN) : h
  if (f.gender === OTHER) {
    const t = f.genderOther.trim()
    if (t) patch.gender = t
  } else if (f.gender) {
    patch.gender = f.gender
  }
  const location = f.location.trim()
  if (location) patch.location = location
  return patch
}
