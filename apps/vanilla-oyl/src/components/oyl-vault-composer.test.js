import { describe, expect, it, beforeAll } from 'vitest'
import { Document, Possession, Subscription, Contact } from '@oyl/all-of-oyl'
import { defineVaultComposer } from './oyl-vault-composer.js'

beforeAll(() => defineVaultComposer())

/** @param {{ addDocument?: (d: any) => Promise<any>, addPossession?: (p: any) => Promise<any>, addSubscription?: (s: any) => Promise<any>, addContact?: (c: any) => Promise<any> }} store */
function composer(store) {
  const el = /** @type {import('./oyl-vault-composer.js').OylVaultComposer} */ (document.createElement('oyl-vault-composer'))
  el.store = /** @type {any} */ (store)
  document.body.append(el)
  return el
}
/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (root(el).querySelector(sel))
const submit = (/** @type {any} */ el) => q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))

describe('<oyl-vault-composer>', () => {
  it('adds a document with name + kind + expiry', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ addDocument: async (d) => { added.push(d); return d } })
    q(el, 'input[name="name"]').value = 'Passport'
    q(el, 'input[name="kind"]').value = 'passport'
    q(el, 'input[name="expiresOn"]').value = '2026-08-30'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Document)
    expect(added[0].name).toBe('Passport')
    expect(added[0].kind).toBe('passport')
    expect(added[0].expiresOn?.value).toBe('2026-08-30')
    el.remove()
  })

  it('shows an error and does not add when a required field is empty', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ addDocument: async (d) => { added.push(d); return d } })
    q(el, 'input[name="name"]').value = 'Passport' // kind left empty
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added).toHaveLength(0)
    expect((q(el, '[data-role="error"]').textContent ?? '').length).toBeGreaterThan(0)
    el.remove()
  })

  it('adds a possession with a Money price from amount + currency', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ addPossession: async (p) => { added.push(p); return p } })
    q(el, 'button[data-type="possession"]').click()
    q(el, 'input[name="name"]').value = 'Espresso machine'
    q(el, 'input[name="amount"]').value = '649'
    q(el, 'select[name="currency"]').value = 'USD'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Possession)
    expect(added[0].name).toBe('Espresso machine')
    expect(added[0].purchasePrice?.minor).toBe(64900)
    expect(added[0].purchasePrice?.currency).toBe('USD')
    el.remove()
  })

  it('toggling to Possession hides the document-only fields', () => {
    const el = composer({})
    const kindField = q(el, 'input[name="kind"]').closest('.field')
    expect(kindField.hidden).toBe(false)
    q(el, 'button[data-type="possession"]').click()
    expect(kindField.hidden).toBe(true)
    el.remove()
  })

  it('adds a subscription with amount, cadence, anchor, and category', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ addSubscription: async (s) => { added.push(s); return s } })
    q(el, 'button[data-type="subscription"]').click()
    q(el, 'input[name="name"]').value = 'Netflix'
    q(el, 'input[name="amount"]').value = '13.99'
    q(el, 'select[name="currency"]').value = 'USD'
    q(el, 'input[name="cadenceN"]').value = '1'
    q(el, 'select[name="cadenceUnit"]').value = 'months'
    q(el, 'input[name="anchor"]').value = '2026-06-01'
    q(el, 'select[name="category"]').value = 'entertainment'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Subscription)
    expect(added[0].name).toBe('Netflix')
    expect(added[0].amount.minor).toBe(1399)
    expect(added[0].cadence.n).toBe(1)
    expect(added[0].cadence.unit).toBe('months')
    expect(added[0].anchor.value).toBe('2026-06-01')
    expect(added[0].category).toBe('entertainment')
    el.remove()
  })

  it('subscription with a non-positive amount shows an error and does not add', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ addSubscription: async (s) => { added.push(s); return s } })
    q(el, 'button[data-type="subscription"]').click()
    q(el, 'input[name="name"]').value = 'Bad'
    q(el, 'input[name="amount"]').value = '0'
    q(el, 'input[name="anchor"]').value = '2026-06-01'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added).toHaveLength(0)
    expect((q(el, '[data-role="error"]').textContent ?? '').length).toBeGreaterThan(0)
    el.remove()
  })

  it('toggling to Subscription shows cadence/anchor/category and hides doc & possession-only fields', () => {
    const el = composer({})
    q(el, 'button[data-type="subscription"]').click()
    expect(q(el, 'input[name="cadenceN"]').closest('.field').hidden).toBe(false)
    expect(q(el, 'input[name="anchor"]').closest('.field').hidden).toBe(false)
    expect(q(el, 'select[name="category"]').closest('.field').hidden).toBe(false)
    expect(q(el, 'input[name="kind"]').closest('.field').hidden).toBe(true)
    expect(q(el, 'input[name="location"]').closest('.field').hidden).toBe(true)
    expect(q(el, 'input[name="amount"]').closest('.field').hidden).toBe(false) // price shared
    el.remove()
  })

  it('adds a contact with a birthday occasion and last-contacted', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ addContact: async (c) => { added.push(c); return c } })
    q(el, 'button[data-type="contact"]').click()
    q(el, 'input[name="name"]').value = 'Sam'
    q(el, 'input[name="birthday"]').value = '1990-06-20'
    q(el, 'input[name="lastContacted"]').value = '2026-03-01'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Contact)
    expect(added[0].name).toBe('Sam')
    expect(added[0].lastContactedOn?.value).toBe('2026-03-01')
    expect(added[0].occasions).toHaveLength(1)
    expect(added[0].occasions[0].name).toBe('birthday')
    expect(added[0].occasions[0].anchor.value).toBe('1990-06-20')
    el.remove()
  })

  it('toggling to Contact shows birthday/last-contacted and hides other fields incl. price (R10)', () => {
    const el = composer({})
    q(el, 'button[data-type="contact"]').click()
    expect(q(el, 'input[name="birthday"]').closest('.field').hidden).toBe(false)
    expect(q(el, 'input[name="lastContacted"]').closest('.field').hidden).toBe(false)
    expect(q(el, 'input[name="kind"]').closest('.field').hidden).toBe(true)
    expect(q(el, 'input[name="amount"]').closest('.field').hidden).toBe(true) // R10: price hidden in contact mode
    expect(q(el, 'input[name="cadenceN"]').closest('.field').hidden).toBe(true)
    el.remove()
  })
})
