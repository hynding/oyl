import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { Cadence, Contact, DayKey, DayRange, Document, GiftIdea, Money, Possession, Subscription } from '@oyl/all-of-oyl'
import { core } from '../../../vitest-setup.js'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const qa = (root: HTMLElement, sel: string) => [...root.shadowRoot!.querySelectorAll(sel)]
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
const flush = () => new Promise((r) => setTimeout(r, 0))
const today = () => DayKey.from(new Date(), 'UTC')
const live = (root: HTMLElement) => q(root, '[aria-live]')!
const segOption = (root: HTMLElement, value: string) => q(root, 'ui-segment')!.shadowRoot!.querySelector(`[data-value="${value}"]`)!
const rows = (root: HTMLElement, list: string) => qa(root, `ol.${list} oyl-item-row`) as (HTMLElement & { itemId: string; label: string; lines: string[]; value?: string; action?: { act: string } })[]
const pickHorizon = (root: HTMLElement, value: string) => q(root, 'ui-select[name="horizon"]')!.dispatchEvent(new CustomEvent('uiChange', { detail: { value }, bubbles: true, composed: true }))

const passport = new Document({ name: 'Passport', kind: 'id', expiresOn: today().addDays(30) })
const laptop = new Possession({ name: 'Laptop', location: 'Desk', purchasePrice: Money.fromMajor(999.99, 'USD') })
const flix = new Subscription({ name: 'StreamFlix', amount: Money.fromMajor(9.99, 'USD'), cadence: Cadence.of(1, 'months'), anchor: today().addDays(12), category: 'entertainment' })
const alex = new Contact({ name: 'Alex', lastContactedOn: today().addDays(-1) })
const teapot = new GiftIdea({ text: 'Teapot', contactId: alex.id })

async function stores() {
  const { signal } = await core()
  const rev = signal(0)
  const bump = () => rev.set(rev.get() + 1)
  const d = { documents: [passport], possessions: [laptop], subscriptions: [flix], contacts: [alex], gifts: [teapot] }
  const spy = (fn: (id: string) => void) => vi.fn(async (id: string) => { fn(id); bump() })
  return {
    data: d,
    store: {
      documents: () => { rev.get(); return [...d.documents] },
      possessions: () => { rev.get(); return [...d.possessions] },
      subscriptions: () => { rev.get(); return [...d.subscriptions] },
      contacts: () => { rev.get(); return [...d.contacts] },
      giftIdeas: () => { rev.get(); return [...d.gifts] },
      monthlySubscriptionTotals: () => { rev.get(); return new Map(d.subscriptions.length ? [['USD', Money.fromMajor(9.99, 'USD')]] : []) },
      upcoming: vi.fn((range: DayRange) => {
        rev.get()
        const feed = [{ itemId: passport.id, label: 'Passport', due: passport.expiresOn! }, { itemId: flix.id, label: 'StreamFlix renews', due: flix.anchor }]
        return feed.filter((u) => range.contains(u.due))
      }),
      addDocument: vi.fn(async (x: Document) => { d.documents.push(x); bump(); return x }),
      addPossession: vi.fn(async (x: Possession) => { d.possessions.push(x); bump(); return x }),
      addSubscription: vi.fn(async (x: Subscription) => { d.subscriptions.push(x); bump(); return x }),
      addContact: vi.fn(async (x: Contact) => { d.contacts.push(x); bump(); return x }),
      addGiftIdea: vi.fn(async (x: GiftIdea) => { d.gifts.push(x); bump(); return x }),
      removeDocument: spy((id) => { d.documents = d.documents.filter((x) => x.id !== id) }),
      removePossession: spy((id) => { d.possessions = d.possessions.filter((x) => x.id !== id) }),
      removeSubscription: spy((id) => { d.subscriptions = d.subscriptions.filter((x) => x.id !== id) }),
      removeContact: spy((id) => { d.contacts = d.contacts.filter((x) => x.id !== id) }),
      removeGiftIdea: spy((id) => { d.gifts = d.gifts.filter((x) => x.id !== id) }),
      recordContact: vi.fn(async (id: string, on: DayKey) => { const c = d.contacts.find((x) => x.id === id); c?.recordContact(on); bump() }),
    },
    renew: vi.fn(async () => undefined),
  }
}

const mount = async (s: Awaited<ReturnType<typeof stores>>) => render(<oyl-vault store={s.store} renew={s.renew} tz="UTC" />)

describe('oyl-vault', () => {
  it('shows Upcoming for the default horizon, re-computes on a horizon change, and empties', async () => {
    const s = await stores()
    const { root, waitForChanges } = await mount(s)
    expect(q(root, 'h2')).toHaveTextContent('Vault')
    const items = qa(root, 'ol.upcoming li')
    expect(items.map((li) => li.querySelector('.label')!.textContent)).toEqual(['Passport', 'StreamFlix renews'])
    expect(items[0].querySelector('.when')!.textContent).toMatch(/^in \d+ (days|weeks)$/)
    expect(items[0].querySelector('.date')!.textContent).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    pickHorizon(root, '30')
    await flush(); await waitForChanges()
    expect(qa(root, 'ol.upcoming li')).toHaveLength(2)
    s.data.documents = []
    s.data.subscriptions = []
    s.store.upcoming.mockImplementation(() => [])
    pickHorizon(root, '365')
    await flush(); await waitForChanges()
    expect(q(root, '[data-role="upcoming-empty"]')).toHaveTextContent('Nothing coming up in the next year.')
  })

  it('shows one kind at a time with its form, rows and empty text', async () => {
    const s = await stores()
    const { root, waitForChanges } = await mount(s)
    expect((q(root, 'ui-segment') as any).value).toBe('documents')
    expect(q(root, 'section.documents details oyl-document-form')).not.toBeNull()
    expect(rows(root, 'documents').map((r) => [r.label, r.lines[0], r.lines[1]])).toEqual([['Passport', 'id', `Expires ${passport.expiresOn!.value}`]])
    expect(q(root, 'section.possessions')).toBeNull()
    click(segOption(root, 'possessions'))
    await waitForChanges()
    expect(q(root, 'section.documents')).toBeNull()
    expect(rows(root, 'possessions').map((r) => [r.label, r.value])).toEqual([['Laptop', '$999.99']])
    click(segOption(root, 'subscriptions'))
    await waitForChanges()
    expect(q(root, '.monthly-total')).toHaveTextContent('$9.99')
    const sub = rows(root, 'subscriptions')[0]
    expect(sub.label).toBe('StreamFlix')
    expect(sub.lines[0]).toBe('$9.99 · every month')
    expect(sub.lines[1]).toMatch(/^Renews /)
    expect(sub.action).toEqual({ act: 'renew', label: 'Renew' })
    click(segOption(root, 'contacts'))
    await waitForChanges()
    const con = rows(root, 'contacts')[0]
    expect(con.label).toBe('Alex')
    expect(con.lines[0]).toBe('Last contacted yesterday')
    expect(con.action).toEqual({ act: 'log', label: 'Log contact' })
    expect(q(root, 'oyl-gift-idea-form')).not.toBeNull()
    expect(rows(root, 'gifts').map((r) => [r.label, r.lines[0]])).toEqual([['Teapot', 'For Alex']])
    s.data.gifts = []
    await s.store.removeGiftIdea('nope')
    await flush(); await waitForChanges()
    expect(q(root, 'section.contacts .gifts-empty')).toHaveTextContent('No gift ideas yet.')
  })

  it('row events call the right store method and announce', async () => {
    const s = await stores()
    const { root, waitForChanges } = await mount(s)
    rows(root, 'documents')[0].dispatchEvent(new CustomEvent('remove', { detail: passport.id, bubbles: true }))
    await flush(); await waitForChanges()
    expect(s.store.removeDocument).toHaveBeenCalledWith(passport.id)
    expect(live(root)).toHaveTextContent('Deleted')
    expect(q(root, 'section.documents .empty')).toHaveTextContent('No documents yet.')
    click(segOption(root, 'subscriptions'))
    await waitForChanges()
    rows(root, 'subscriptions')[0].dispatchEvent(new CustomEvent('act', { detail: { act: 'renew', itemId: flix.id }, bubbles: true }))
    await flush(); await waitForChanges()
    expect(s.renew).toHaveBeenCalledWith(flix.id, expect.objectContaining({ value: today().value }))
    expect(live(root)).toHaveTextContent('Renewed — expense recorded')
    click(segOption(root, 'contacts'))
    await waitForChanges()
    rows(root, 'contacts')[0].dispatchEvent(new CustomEvent('act', { detail: { act: 'log', itemId: alex.id }, bubbles: true }))
    await flush(); await waitForChanges()
    expect(s.store.recordContact).toHaveBeenCalledWith(alex.id, expect.objectContaining({ value: today().value }))
    expect(live(root)).toHaveTextContent('Logged')
    expect(rows(root, 'contacts')[0].lines[0]).toBe('Last contacted today')
    rows(root, 'gifts')[0].dispatchEvent(new CustomEvent('remove', { detail: teapot.id, bubbles: true }))
    await flush(); await waitForChanges()
    expect(s.store.removeGiftIdea).toHaveBeenCalledWith(teapot.id)
    q(root, 'oyl-contact-form')!.dispatchEvent(new CustomEvent('added', { bubbles: true }))
    await waitForChanges()
    expect(live(root)).toHaveTextContent('Added to vault')
    q(root, 'oyl-gift-idea-form')!.dispatchEvent(new CustomEvent('added', { bubbles: true }))
    await waitForChanges()
    expect(live(root)).toHaveTextContent('Gift idea added')
  })
})
