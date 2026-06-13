import { describe, expect, it } from 'vitest'
import { Vault } from './vault.js'
import { Document } from './document.js'
import { Possession } from './possession.js'
import { Subscription } from './subscription.js'
import { Contact } from './contact.js'
import { GiftIdea } from './gift-idea.js'
import { Cadence } from '../core/cadence.js'
import { DayKey } from '../core/day-key.js'
import { DayRange } from '../core/day-range.js'
import { Id } from '../core/id.js'
import { Money } from '../core/money.js'
import { DomainError } from '../core/domain-error.js'

const day = (s: string) => DayKey.of(s)
const range = (a: string, b: string) => DayRange.of(day(a), day(b))

function loadedVault() {
  const vault = new Vault()
  const passport = new Document({ name: 'Passport', kind: 'passport', expiresOn: day('2026-08-30') })
  const machine = new Possession({ name: 'Espresso machine', warrantyUntil: day('2026-07-01') })
  const netflix = new Subscription({
    name: 'Netflix', amount: Money.usd(1599), cadence: Cadence.of(1, 'months'),
    anchor: day('2026-01-15'), renewedThrough: day('2026-05-15'), category: 'streaming',
  })
  const sam = new Contact({ name: 'Sam', occasions: [{ name: 'birthday', anchor: day('1990-06-20'), cadence: Cadence.of(1, 'years') }] })
  const kettle = new GiftIdea({ text: 'Pour-over kettle', contactId: sam.id })
  vault.addDocument(passport)
  vault.addPossession(machine)
  vault.addSubscription(netflix)
  vault.addContact(sam)
  vault.addGiftIdea(kettle)
  return { vault, passport, machine, netflix, sam, kettle }
}

describe('Vault', () => {
  it('strict adds and idempotent removes per registry', () => {
    const { vault, passport, sam } = loadedVault()
    let caught: unknown
    try {
      vault.addDocument(passport)
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('DUPLICATE_ID')
    vault.removeDocument(passport.id)
    vault.removeDocument(passport.id) // no-op
    expect(vault.documents()).toHaveLength(0)
    expect(vault.contacts().map((c) => c.id)).toEqual([sam.id])
  })

  it('upcoming() unifies every registry into one sorted feed', () => {
    const { vault, passport, machine, netflix, sam } = loadedVault()
    const feed = vault.upcoming(range('2026-06-01', '2026-09-30'))
    expect(feed.map((d) => [d.due.value, d.label])).toEqual([
      ['2026-06-15', 'Netflix'],
      ['2026-06-20', 'Sam — birthday'],
      ['2026-07-01', 'Espresso machine (warranty)'],
      ['2026-08-30', 'Passport'],
    ])
    expect(feed.map((d) => d.itemId)).toEqual([netflix.id, sam.id, machine.id, passport.id])
  })

  it('upcoming() excludes dues outside the range (lapsed pendings surface via nextDueOn, not the feed)', () => {
    const { vault } = loadedVault()
    const gym = new Subscription({
      name: 'Gym', amount: Money.usd(4000), cadence: Cadence.of(1, 'months'),
      anchor: day('2026-01-01'), renewedThrough: day('2026-04-01'), category: 'fitness',
    })
    vault.addSubscription(gym)
    const feed = vault.upcoming(range('2026-06-01', '2026-06-30'))
    expect(feed.map((d) => d.label)).toEqual(['Netflix', 'Sam — birthday'])
    // the lapsed pending is still visible directly — never silently skipped
    expect(gym.nextDueOn(day('2026-06-01'))?.value).toBe('2026-05-01')
  })

  it('giftIdeasFor returns ideas linked to a contact', () => {
    const { vault, sam, kettle } = loadedVault()
    expect(vault.giftIdeasFor(sam.id).map((g) => g.id)).toEqual([kettle.id])
    expect(vault.giftIdeasFor(Id.create())).toHaveLength(0)
  })

  it('monthlySubscriptionTotals prorates per currency', () => {
    const { vault } = loadedVault() // Netflix monthly 15.99 USD
    vault.addSubscription(
      new Subscription({
        name: 'Backups', amount: Money.usd(6000), cadence: Cadence.of(1, 'years'),
        anchor: day('2026-01-01'), category: 'software',
      }),
    ) // 60.00/year → 5.00/month
    vault.addSubscription(
      new Subscription({
        name: 'Comic', amount: Money.of(700, 'EUR'), cadence: Cadence.of(1, 'months'),
        anchor: day('2026-01-01'), category: 'fun',
      }),
    )
    const totals = vault.monthlySubscriptionTotals()
    expect(totals.get('USD')?.equals(Money.usd(1599 + 500))).toBe(true)
    expect(totals.get('EUR')?.equals(Money.of(700, 'EUR'))).toBe(true)
  })
})
