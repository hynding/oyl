import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { Consumable, Consumption, DayKey, sumNutrients } from '@oyl/all-of-oyl'
import { formatDayHeading } from '@oyl/all-of-oyl/format'
import { core } from '../../../vitest-setup.js'

const nav = (root: HTMLElement) => root.shadowRoot!.querySelector('oyl-day-nav')!
const navQ = (root: HTMLElement, sel: string) => nav(root).shadowRoot!.querySelector(sel)
const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const qa = (root: HTMLElement, sel: string) => [...root.shadowRoot!.querySelectorAll(sel)]
const flush = () => new Promise((r) => setTimeout(r, 0))
const today = () => DayKey.from(new Date(), 'UTC')
const at = (t: DayKey, h: number) => new Date(`${t.value}T${String(h).padStart(2, '0')}:00:00Z`)
const tiles = (root: HTMLElement) => qa(root, '[data-role="totals"] .tile b').map((b) => b.textContent)

const oats = new Consumable({ name: 'Oatmeal', slug: 'oatmeal', facts: { calories: 150, protein: 5 } })

async function stores(consumptions: Consumption[] = [], consumables: Consumable[] = [oats]) {
  const { signal } = await core()
  const jRev = signal(0)
  const cRev = signal(0)
  const all = [...consumptions]
  const cs = [...consumables]
  const on = (day: DayKey) => all.filter((c) => DayKey.from(c.occurredAt, 'UTC').equals(day))
  return {
    journal: {
      consumptionsOn: (day: DayKey) => { jRev.get(); return on(day) },
      dailyNutrients: (day: DayKey) => { jRev.get(); return sumNutrients(on(day)) },
      add: vi.fn(async (c: Consumption) => { all.push(c); jRev.set(jRev.get() + 1); return c }),
      remove: vi.fn(async (id: string) => { const i = all.findIndex((c) => c.id === id); if (i >= 0) all.splice(i, 1); jRev.set(jRev.get() + 1) }),
    },
    consumables: { all: () => { cRev.get(); return [...cs] }, add: vi.fn(async (c: Consumable) => { cs.push(c); cRev.set(cRev.get() + 1); return c }) },
    products: { all: () => [] },
  }
}

describe('oyl-nutrition', () => {
  it('shows today, dashed tiles, the composer, the empty state and the catalog', async () => {
    const s = await stores()
    const { root } = await render(<oyl-nutrition store={s.journal} consumables={s.consumables} consumableProducts={s.products} tz="UTC" />)
    expect(navQ(root, 'h2')).toHaveTextContent(formatDayHeading(today()))
    expect(tiles(root)).toEqual(['—', '—', '—', '—', '—'])
    expect(q(root, 'oyl-meal-form')).not.toBeNull()
    expect(q(root, '[data-role="empty"]')).toHaveTextContent(`No meals logged for ${formatDayHeading(today())}`)
    expect(q(root, 'details oyl-consumable-form')).not.toBeNull()
    expect(qa(root, 'ol.catalog li').map((li) => li.textContent)).toEqual(['Oatmeal150 kcal · 5g P'])
  })

  it('totals the day and lists meals newest first with catalog labels', async () => {
    const t = today()
    const a = new Consumption({ occurredAt: at(t, 8), consumable: { id: oats.id, nutrients: oats.facts }, servings: 2 })
    const b = new Consumption({ occurredAt: at(t, 12), nutrients: { calories: 420.4, protein: 22.5 }, note: 'Stir-fry' })
    const yesterday = new Consumption({ occurredAt: at(t.addDays(-1), 9), nutrients: { calories: 999 } })
    const s = await stores([a, b, yesterday])
    const { root } = await render(<oyl-nutrition store={s.journal} consumables={s.consumables} consumableProducts={s.products} tz="UTC" />)
    expect(tiles(root)).toEqual(['720', '33', '—', '—', '—'])
    expect(qa(root, 'oyl-meal-row').map((r) => (r as any).label)).toEqual(['Stir-fry', 'Oatmeal ×2'])
    expect(q(root, '[data-role="empty"]')).toBeNull()
  })

  it('remove calls the store and announces; logged and added announce', async () => {
    const t = today()
    const a = new Consumption({ occurredAt: at(t, 8), nutrients: { calories: 99 }, note: 'Snack' })
    const s = await stores([a])
    const { root, waitForChanges } = await render(<oyl-nutrition store={s.journal} consumables={s.consumables} consumableProducts={s.products} tz="UTC" />)
    q(root, 'oyl-meal-row')!.dispatchEvent(new CustomEvent('remove', { detail: a.id, bubbles: true }))
    await flush(); await waitForChanges()
    expect(s.journal.remove).toHaveBeenCalledWith(a.id)
    expect(navQ(root, '[aria-live]')).toHaveTextContent('Meal deleted')
    expect(qa(root, 'oyl-meal-row')).toHaveLength(0)
    expect(tiles(root)[0]).toBe('—')
    q(root, 'oyl-meal-form')!.dispatchEvent(new CustomEvent('logged', { bubbles: true }))
    await waitForChanges()
    expect(navQ(root, '[aria-live]')).toHaveTextContent('Meal logged')
    q(root, 'oyl-consumable-form')!.dispatchEvent(new CustomEvent('added', { bubbles: true }))
    await waitForChanges()
    expect(navQ(root, '[aria-live]')).toHaveTextContent('Consumable added')
  })

  it('the catalog list reacts to an added consumable', async () => {
    const s = await stores()
    const { root, waitForChanges } = await render(<oyl-nutrition store={s.journal} consumables={s.consumables} consumableProducts={s.products} tz="UTC" />)
    await s.consumables.add(new Consumable({ name: 'Banana', slug: 'banana', facts: { calories: 105 } }))
    await flush(); await waitForChanges()
    expect(qa(root, 'ol.catalog li').length).toBe(2)
  })

  it('marks strip days with meals and arrow keys move days unless in a field', async () => {
    const t = today()
    const s = await stores([new Consumption({ occurredAt: at(t.addDays(1), 9), nutrients: { calories: 1 } })])
    const { root, waitForChanges } = await render(<oyl-nutrition store={s.journal} consumables={s.consumables} consumableProducts={s.products} tz="UTC" />)
    const dotted = [...nav(root).shadowRoot!.querySelectorAll('[data-day]')].filter((p) => p.querySelector('.dot')).map((p) => p.getAttribute('data-day'))
    expect(dotted).toEqual([t.addDays(1).value])
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await flush(); await waitForChanges()
    expect(navQ(root, '.rel')).toHaveTextContent('Tomorrow')
    expect(qa(root, 'oyl-meal-row')).toHaveLength(1)
    const input = q(root, 'oyl-meal-form')!.shadowRoot!.querySelector('ui-field[name="servings"]')!.shadowRoot!.querySelector('input')!
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, composed: true }))
    await flush(); await waitForChanges()
    expect(navQ(root, '.rel')).toHaveTextContent('Tomorrow')
  })
})
