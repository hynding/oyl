import type { Contact, DayKey, Document, GiftIdea, Possession, Subscription } from '@oyl/all-of-oyl'
import { cadenceLabel, dueInLabel, formatMoney, monthDayLabel, spanLabel } from '@oyl/all-of-oyl/format'

export const HORIZONS: ReadonlyArray<readonly [number, string]> = [[30, 'Next 30 days'], [90, 'Next 90 days'], [365, 'Next year']]
export const CADENCE_UNITS: readonly string[] = ['days', 'weeks', 'months', 'years']
export const SUBSCRIPTION_CATEGORIES: readonly string[] = ['entertainment', 'software', 'fitness', 'utilities', 'news', 'other']

/** "Last contacted 3 months ago" / "Last contacted today" / "Never contacted" — vanilla's rule. */
export function stalenessLabel(days: number | undefined): string {
  if (days === undefined) return 'Never contacted'
  if (days <= 0) return 'Last contacted today'
  if (days === 1) return 'Last contacted yesterday'
  return `Last contacted ${spanLabel(days)} ago`
}

export function upcomingEmptyText(horizon: number): string {
  return `Nothing coming up in the ${horizon === 365 ? 'next year' : `next ${horizon} days`}.`
}

export function documentLines(d: Document): readonly (string | null)[] {
  return [d.kind, d.expiresOn ? `Expires ${d.expiresOn.value}` : null]
}

export function possessionLines(p: Possession): readonly (string | null | undefined)[] {
  return [p.location, p.warrantyUntil ? `Warranty until ${p.warrantyUntil.value}` : null]
}

export function possessionValue(p: Possession): string | undefined {
  return p.purchasePrice ? formatMoney(p.purchasePrice) : undefined
}

/** "$9.99 · every month" then "Renews {iso} · in N days" ("Overdue · …" when the due day has passed). */
export function subscriptionLines(s: Subscription, today: DayKey): readonly (string | null)[] {
  const due = s.nextDueOn(today)
  const renew = due ? `${due.compare(today) < 0 ? 'Overdue · ' : ''}Renews ${due.value} · ${dueInLabel(due, today)}` : null
  return [`${formatMoney(s.amount)} · ${cadenceLabel(s.cadence)}`, renew]
}

export function contactLines(c: Contact, today: DayKey): readonly string[] {
  return [stalenessLabel(c.staleness(today)), ...c.occasions.map((o) => `${o.name.charAt(0).toUpperCase()}${o.name.slice(1)} ${monthDayLabel(o.anchor)}`)]
}

export function giftLines(g: GiftIdea, namesById: ReadonlyMap<string, string>): readonly string[] {
  return [`For ${namesById.get(g.contactId) ?? 'Unknown contact'}`]
}

/** Read a `ui-field` value inside a form's shadow root ('' when absent). */
export function fieldValue(root: { querySelector(sel: string): Element | null } | null | undefined, name: string): string {
  return ((root?.querySelector(`ui-field[name="${name}"]`) as (Element & { value?: string }) | null)?.value ?? '').trim()
}

/** Clear every `ui-field` in a form's shadow root. */
export function clearFields(root: { querySelectorAll(sel: string): Iterable<Element> } | null | undefined): void {
  for (const el of root?.querySelectorAll('ui-field') ?? []) (el as Element & { value: string }).value = ''
}
