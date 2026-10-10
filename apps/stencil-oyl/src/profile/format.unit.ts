import { describe, expect, it, vi } from 'vitest'
import { User } from '@oyl/all-of-oyl'
import { CM_PER_IN, GENDERS, GENDER_OPTIONS, KG_PER_LB, UNIT_OPTIONS, bodySummary, readPatch, round1, seedFrom, timezoneOptions, toPatch } from './format.js'

vi.mock('@oyl/all-of-oyl/client', () => ({ defaultTimezone: () => 'UTC' }))

const user = (over: Record<string, unknown> = {}) => new User({ displayName: 'You', timezone: 'Europe/Paris', defaultCurrency: 'EUR', ...over })
const fields = (over: Partial<Parameters<typeof readPatch>[0]> = {}) => ({ timezone: 'Europe/Paris', units: 'metric' as const, birthday: '', weight: '', height: '', gender: '', genderOther: '', location: '', ...over })

describe('lists', () => {
  it('genders, units', () => {
    expect(GENDERS).toEqual(['female', 'male', 'non-binary', 'prefer not to say'])
    expect(GENDER_OPTIONS.map((o) => o.value)).toEqual(['', ...GENDERS, '__other__'])
    expect(GENDER_OPTIONS[0]!.label).toBe('—')
    expect(GENDER_OPTIONS.at(-1)!.label).toBe('Other')
    expect(UNIT_OPTIONS).toEqual([{ value: 'metric', label: 'Metric (kg, cm)' }, { value: 'imperial', label: 'Imperial (lb, ft/in)' }])
    expect(KG_PER_LB).toBe(0.45359237)
    expect(CM_PER_IN).toBe(2.54)
    expect(round1(81.649)).toBe(81.6)
  })
})

describe('toPatch', () => {
  it('carries the required fields and only the optional ones that are set', () => {
    expect(toPatch(user())).toEqual({ displayName: 'You', timezone: 'Europe/Paris', defaultCurrency: 'EUR' })
    expect(toPatch(user({ units: 'imperial', birthday: '1990-06-15', weightKg: 81.5, heightCm: 179.5, gender: 'male', location: 'Berlin' }))).toEqual({
      displayName: 'You', timezone: 'Europe/Paris', defaultCurrency: 'EUR', units: 'imperial', birthday: '1990-06-15', weightKg: 81.5, heightCm: 179.5, gender: 'male', location: 'Berlin',
    })
  })
})

describe('bodySummary', () => {
  it('joins the present parts in the stored units', () => {
    expect(bodySummary(null, '2026-10-09')).toBe('')
    expect(bodySummary(user(), '2026-10-09')).toBe('')
    expect(bodySummary(user({ weightKg: 81.5, heightCm: 179.5, birthday: '1990-06-15' }), '2026-10-09')).toBe('81.5 kg · 180 cm · 36 yrs')
    expect(bodySummary(user({ units: 'imperial', weightKg: 81.5 }), '2026-10-09')).toBe('180 lb')
    expect(bodySummary(user({ birthday: '1990-10-10' }), '2026-10-09')).toBe('35 yrs')
  })
})

describe('timezoneOptions', () => {
  const zones = ['America/Los_Angeles', 'Europe/Paris']
  it('null zones → null; an unlisted current zone is kept as the first option', () => {
    expect(timezoneOptions(null, 'UTC')).toBeNull()
    expect(timezoneOptions(zones, 'Europe/Paris')!.map((o) => o.value)).toEqual(zones)
    expect(timezoneOptions(zones, 'UTC')!.map((o) => o.value)).toEqual(['UTC', ...zones])
    expect(timezoneOptions(zones, 'Asia/Calcutta')![0]).toEqual({ value: 'Asia/Calcutta', label: 'Asia/Calcutta' })
  })
})

describe('seedFrom', () => {
  it('seeds display values in the stored units, detects a custom gender, defaults the timezone', () => {
    expect(seedFrom({})).toEqual({ timezone: 'UTC', units: 'metric', birthday: '', weight: '', height: '', gender: '', genderOther: '', location: '' })
    expect(seedFrom({ timezone: 'Europe/Paris', units: 'imperial', weightKg: 81.5, heightCm: 179.5, gender: 'agender', birthday: '1990-06-15', location: 'Berlin' })).toEqual({
      timezone: 'Europe/Paris', units: 'imperial', birthday: '1990-06-15', weight: '179.7', height: '70.7', gender: '__other__', genderOther: 'agender', location: 'Berlin',
    })
    expect(seedFrom({ units: 'metric', weightKg: 81.5, heightCm: 179.5, gender: 'male' })).toMatchObject({ weight: '81.5', height: '179.5', gender: 'male', genderOther: '' })
  })
})

describe('readPatch', () => {
  it('always carries timezone + units; optional fields only when valid and non-empty', () => {
    expect(readPatch(fields())).toEqual({ timezone: 'Europe/Paris', units: 'metric' })
    expect(readPatch(fields({ birthday: '1990-06-15', weight: '81.5', height: '179.5', location: ' Berlin ' }))).toEqual({
      timezone: 'Europe/Paris', units: 'metric', birthday: '1990-06-15', weightKg: 81.5, heightCm: 179.5, location: 'Berlin',
    })
    expect(readPatch(fields({ weight: '0', height: '-1' }))).toEqual({ timezone: 'Europe/Paris', units: 'metric' })
    expect(readPatch(fields({ weight: 'abc' }))).toEqual({ timezone: 'Europe/Paris', units: 'metric' })
  })

  it('converts imperial entries to metric, rounded to 0.1', () => {
    expect(readPatch(fields({ units: 'imperial', weight: '180', height: '70' }))).toMatchObject({ units: 'imperial', weightKg: 81.6, heightCm: 177.8 })
  })

  it('gender: a preset, a self-described value, or nothing', () => {
    expect(readPatch(fields({ gender: 'male' }))).toMatchObject({ gender: 'male' })
    expect(readPatch(fields({ gender: '__other__', genderOther: ' agender ' }))).toMatchObject({ gender: 'agender' })
    expect(readPatch(fields({ gender: '__other__', genderOther: '  ' }))).not.toHaveProperty('gender')
    expect(readPatch(fields({ gender: '' }))).not.toHaveProperty('gender')
  })
})
