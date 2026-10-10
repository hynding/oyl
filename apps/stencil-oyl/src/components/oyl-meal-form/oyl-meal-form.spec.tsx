import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { Consumable, ConsumableProduct, DayKey } from '@oyl/all-of-oyl'
import { core } from '../../../vitest-setup.js'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const field = (root: HTMLElement, name: string) => q(root, `ui-field[name="${name}"]`) as HTMLElement & { value: string }
const select = (root: HTMLElement, name: string) => q(root, `ui-select[name="${name}"]`) as HTMLElement & { value: string; options: { value: string; label: string }[] }
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
const segOption = (root: HTMLElement, value: string) => q(root, 'ui-segment')!.shadowRoot!.querySelector(`[data-value="${value}"]`)!
const submit = (root: HTMLElement) => { const f = q(root, 'form')!; const ev = f.ownerDocument.createEvent('Event'); ev.initEvent('submit', true, true); f.dispatchEvent(ev) }
const flush = () => new Promise((r) => setTimeout(r, 0))
const pick = (root: HTMLElement, name: string, value: string) => select(root, name).dispatchEvent(new CustomEvent('uiChange', { detail: { value }, bubbles: true, composed: true }))
const day = DayKey.of('2026-10-08')

const oats = new Consumable({ name: 'Oatmeal', slug: 'oatmeal', facts: { calories: 150, protein: 5 } })
const banana = new Consumable({ name: 'Banana', slug: 'banana', facts: { calories: 105 } })
const brandOats = new ConsumableProduct({ consumableId: oats.id, name: 'Brand oats', facts: { calories: 160 } })

async function stores(consumables: Consumable[] = [oats, banana], products: ConsumableProduct[] = []) {
  const { signal } = await core()
  const cRev = signal(0)
  const pRev = signal(0)
  const cs = [...consumables]
  const ps = [...products]
  return {
    journal: { add: vi.fn(async (c: unknown) => c) },
    consumables: { all: () => { cRev.get(); return [...cs] }, add: vi.fn(async (c: Consumable) => { cs.push(c); cRev.set(cRev.get() + 1); return c }) },
    products: { all: () => { pRev.get(); return [...ps] } },
  }
}

describe('oyl-meal-form', () => {
  it('defaults to catalog mode with the consumables as options, servings 1, when prefilled', async () => {
    const s = await stores()
    const { root } = await render(<oyl-meal-form store={s.journal} consumables={s.consumables} consumableProducts={s.products} day={day} />)
    expect((q(root, 'ui-segment') as any).value).toBe('catalog')
    expect(select(root, 'consumable').options).toEqual([{ value: oats.id, label: 'Oatmeal' }, { value: banana.id, label: 'Banana' }])
    expect(select(root, 'consumableProduct')).toBeNull()
    expect(field(root, 'note')).toBeNull()
    expect(field(root, 'servings').value).toBe('1')
    expect(field(root, 'when')).toHaveAttribute('type', 'datetime-local')
    expect(field(root, 'when').value).toMatch(/^2026-10-08T\d{2}:\d{2}$/)
  })

  it('shows the product select only when the chosen consumable has products', async () => {
    const s = await stores([oats, banana], [brandOats])
    const { root, waitForChanges } = await render(<oyl-meal-form store={s.journal} consumables={s.consumables} consumableProducts={s.products} day={day} />)
    expect(select(root, 'consumableProduct').options).toEqual([{ value: '', label: '— no specific product —' }, { value: brandOats.id, label: 'Brand oats' }])
    pick(root, 'consumable', banana.id)
    await waitForChanges()
    expect(select(root, 'consumableProduct')).toBeNull()
  })

  it('reacts to a consumable added to the catalog', async () => {
    const s = await stores([oats])
    const { root, waitForChanges } = await render(<oyl-meal-form store={s.journal} consumables={s.consumables} consumableProducts={s.products} day={day} />)
    await s.consumables.add(banana)
    await flush(); await waitForChanges()
    expect(select(root, 'consumable').options.map((o) => o.label)).toEqual(['Oatmeal', 'Banana'])
  })

  it('logs from the catalog with a nutrient snapshot and servings, emits logged and resets', async () => {
    const s = await stores()
    const { root, waitForChanges } = await render(<oyl-meal-form store={s.journal} consumables={s.consumables} consumableProducts={s.products} day={day} />)
    const logged = vi.fn()
    root.addEventListener('logged', logged)
    pick(root, 'consumable', banana.id)
    field(root, 'servings').value = '2'
    submit(root)
    await flush(); await waitForChanges()
    const c = s.journal.add.mock.calls[0][0] as any
    expect(c.kind).toBe('consumption')
    expect(c.consumableId).toBe(banana.id)
    expect(c.consumableProductId).toBeUndefined()
    expect(c.nutrients).toEqual({ calories: 105 })
    expect(c.servings).toBe(2)
    const d = c.occurredAt as Date
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 10, 8])
    expect(logged).toHaveBeenCalledTimes(1)
    expect(field(root, 'servings').value).toBe('1')
  })

  it('logs a specific product with its effective facts', async () => {
    const s = await stores([oats], [brandOats])
    const { root, waitForChanges } = await render(<oyl-meal-form store={s.journal} consumables={s.consumables} consumableProducts={s.products} day={day} />)
    pick(root, 'consumableProduct', brandOats.id)
    submit(root)
    await flush(); await waitForChanges()
    const c = s.journal.add.mock.calls[0][0] as any
    expect(c.consumableId).toBe(oats.id)
    expect(c.consumableProductId).toBe(brandOats.id)
    expect(c.nutrients).toEqual({ calories: 160 })
  })

  it('logs an ad-hoc meal with the filled nutrients and note', async () => {
    const s = await stores()
    const { root, waitForChanges } = await render(<oyl-meal-form store={s.journal} consumables={s.consumables} consumableProducts={s.products} day={day} />)
    click(segOption(root, 'adhoc'))
    await waitForChanges()
    expect(select(root, 'consumable')).toBeNull()
    field(root, 'note').value = 'Leftover stir-fry'
    field(root, 'calories').value = '420'
    field(root, 'protein').value = '22.5'
    submit(root)
    await flush(); await waitForChanges()
    const c = s.journal.add.mock.calls[0][0] as any
    expect(c.consumableId).toBeUndefined()
    expect(c.note).toBe('Leftover stir-fry')
    expect(c.nutrients).toEqual({ calories: 420, protein: 22.5 })
    expect(field(root, 'note').value).toBe('')
    expect(field(root, 'calories').value).toBe('')
  })

  it('an empty catalog cannot log: the error shows inline', async () => {
    const s = await stores([])
    const { root, waitForChanges } = await render(<oyl-meal-form store={s.journal} consumables={s.consumables} consumableProducts={s.products} day={day} />)
    submit(root)
    await flush(); await waitForChanges()
    expect(s.journal.add).not.toHaveBeenCalled()
    expect(q(root, '[data-role="error"]')).toHaveTextContent('Pick a consumable to log')
  })

  it('re-syncs when on day change and submits on ⌘Enter', async () => {
    const s = await stores()
    const { root, waitForChanges } = await render(<oyl-meal-form store={s.journal} consumables={s.consumables} consumableProducts={s.products} day={day} />)
    ;(root as any).day = DayKey.of('2026-10-10')
    await waitForChanges()
    expect(field(root, 'when').value).toMatch(/^2026-10-10T/)
    q(root, 'form')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, composed: true }))
    await flush(); await waitForChanges()
    expect(s.journal.add).toHaveBeenCalledTimes(1)
  })
})
