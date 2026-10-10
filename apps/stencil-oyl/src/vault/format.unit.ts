import { describe, expect, it } from 'vitest'
import { Cadence, Contact, DayKey, Document, GiftIdea, Money, Possession, Subscription } from '@oyl/all-of-oyl'
import {
  CADENCE_UNITS, HORIZONS, SUBSCRIPTION_CATEGORIES, contactLines, documentLines, giftLines, possessionLines, possessionValue,
  stalenessLabel, subscriptionLines, upcomingEmptyText,
} from './format.js'

const today = DayKey.of('2026-10-08')

describe('lists', () => {
  it('match vanilla', () => {
    expect(HORIZONS).toEqual([[30, 'Next 30 days'], [90, 'Next 90 days'], [365, 'Next year']])
    expect(CADENCE_UNITS).toEqual(['days', 'weeks', 'months', 'years'])
    expect(SUBSCRIPTION_CATEGORIES).toEqual(['entertainment', 'software', 'fitness', 'utilities', 'news', 'other'])
  })
})

describe('stalenessLabel', () => {
  it('phrases never / today / yesterday / longer gaps', () => {
    expect(stalenessLabel(undefined)).toBe('Never contacted')
    expect(stalenessLabel(0)).toBe('Last contacted today')
    expect(stalenessLabel(1)).toBe('Last contacted yesterday')
    expect(stalenessLabel(95)).toBe('Last contacted 3 months ago')
  })
})

describe('upcomingEmptyText', () => {
  it('names the window', () => {
    expect(upcomingEmptyText(30)).toBe('Nothing coming up in the next 30 days.')
    expect(upcomingEmptyText(365)).toBe('Nothing coming up in the next year.')
  })
})

describe('row lines', () => {
  it('document: kind and expiry', () => {
    expect(documentLines(new Document({ name: 'Passport', kind: 'id', expiresOn: DayKey.of('2026-11-07') }))).toEqual(['id', 'Expires 2026-11-07'])
    expect(documentLines(new Document({ name: 'Lease', kind: 'contract' }))).toEqual(['contract', null])
  })
  it('possession: location, warranty and price', () => {
    const p = new Possession({ name: 'Laptop', location: 'Desk', warrantyUntil: DayKey.of('2027-01-01'), purchasePrice: Money.fromMajor(999.99, 'USD') })
    expect(possessionLines(p)).toEqual(['Desk', 'Warranty until 2027-01-01'])
    expect(possessionValue(p)).toBe('$999.99')
    expect(possessionValue(new Possession({ name: 'Mug' }))).toBeUndefined()
  })
  it('subscription: amount · cadence, then the renewal line, flagged when overdue', () => {
    const s = new Subscription({ name: 'StreamFlix', amount: Money.fromMajor(9.99, 'USD'), cadence: Cadence.of(1, 'months'), anchor: DayKey.of('2026-10-20'), category: 'entertainment' })
    expect(subscriptionLines(s, today)).toEqual(['$9.99 · every month', 'Renews 2026-10-20 · in 12 days'])
    const late = new Subscription({ name: 'Old', amount: Money.fromMajor(5, 'USD'), cadence: Cadence.of(1, 'months'), anchor: DayKey.of('2026-10-01'), category: 'other' })
    expect(subscriptionLines(late, today)[1]).toMatch(/^Overdue · Renews 2026-10-01/)
  })
  it('contact: staleness then capitalised occasions', () => {
    const c = new Contact({ name: 'Alex', lastContactedOn: DayKey.of('2026-10-07'), occasions: [{ name: 'birthday', anchor: DayKey.of('1990-03-14'), cadence: Cadence.of(1, 'years') }] })
    expect(contactLines(c, today)).toEqual(['Last contacted yesterday', 'Birthday Mar 14'])
  })
  it('gift idea: names the contact or admits it is unknown', () => {
    const g = new GiftIdea({ text: 'Teapot', contactId: 'c1' as never })
    expect(giftLines(g, new Map([['c1', 'Alex']]))).toEqual(['For Alex'])
    expect(giftLines(g, new Map())).toEqual(['For Unknown contact'])
  })
})
