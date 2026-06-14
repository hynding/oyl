import { describe, expect, it, beforeAll } from 'vitest'
import { Document, Possession } from '@oyl/all-of-oyl'
import { defineVaultComposer } from './oyl-vault-composer.js'

beforeAll(() => defineVaultComposer())

/** @param {{ addDocument?: (d: any) => Promise<any>, addPossession?: (p: any) => Promise<any> }} store */
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
})
