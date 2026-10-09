import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { DayKey, Task } from '@oyl/all-of-oyl'
import { formatDayHeading } from '@oyl/all-of-oyl/format'
import { core } from '../../../vitest-setup.js'

const nav = (root: HTMLElement) => root.shadowRoot!.querySelector('oyl-day-nav')!
const navQ = (root: HTMLElement, sel: string) => nav(root).shadowRoot!.querySelector(sel)
const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const qa = (root: HTMLElement, sel: string) => [...root.shadowRoot!.querySelectorAll(sel)]
const flush = () => new Promise((r) => setTimeout(r, 0))
const today = () => DayKey.from(new Date(), 'UTC')
const rowTitles = (root: HTMLElement, scope = '') => qa(root, `${scope} oyl-plan-row`).map((r) => (r as any).plan.title)

/** A planner store fake, reactive through the bundle's signal. */
async function fakeStore(plans: Task[] = []) {
  const { signal } = await core()
  const revision = signal(0)
  const all = [...plans]
  const bump = () => revision.set(revision.get() + 1)
  return {
    revision,
    overdue: (day: DayKey) => { revision.get(); return all.filter((p) => p.status === 'open' && p.due!.compare(day) < 0) },
    agendaFor: (day: DayKey) => { revision.get(); return all.filter((p) => p.status !== 'canceled' && p.due!.equals(day)) },
    canceledOn: (day: DayKey) => { revision.get(); return all.filter((p) => p.status === 'canceled' && p.due!.equals(day)) },
    add: vi.fn(async (p: Task) => { all.push(p); bump(); return p }),
    complete: vi.fn(async (id: string, on: DayKey) => { all.find((p) => p.id === id)?.complete(on); bump() }),
    cancel: vi.fn(async (id: string) => { all.find((p) => p.id === id)?.cancel(); bump() }),
    remove: vi.fn(async (id: string) => { const i = all.findIndex((p) => p.id === id); if (i >= 0) all.splice(i, 1); bump() }),
  }
}

describe('oyl-planner', () => {
  it('shows today with the day nav, the composer and the empty state', async () => {
    const store = await fakeStore()
    const { root } = await render(<oyl-planner store={store} tz="UTC" />)
    expect(navQ(root, 'h2')).toHaveTextContent(formatDayHeading(today()))
    expect(q(root, 'oyl-plan-composer')).not.toBeNull()
    expect(q(root, '.empty')).toHaveTextContent(`Nothing planned for ${formatDayHeading(today())}`)
    expect(q(root, '.section-label')).toBeNull()
  })

  it('lists overdue plans under Overdue on today only, then the day agenda and canceled plans', async () => {
    const t = today()
    const late = new Task({ title: 'Late', due: t.addDays(-2) })
    const now = new Task({ title: 'Now', due: t })
    const gone = new Task({ title: 'Gone', due: t })
    gone.cancel()
    const store = await fakeStore([late, now, gone])
    const { root, waitForChanges } = await render(<oyl-planner store={store} tz="UTC" />)
    expect(q(root, '.section-label.overdue')).toHaveTextContent('Overdue')
    expect(rowTitles(root, '.overdue-list')).toEqual(['Late'])
    expect((q(root, '.overdue-list oyl-plan-row') as any).overdueAsOf.value).toBe(t.value)
    expect(q(root, '.section-label:not(.overdue)')).toHaveTextContent(formatDayHeading(t))
    expect(rowTitles(root, '.agenda-list')).toEqual(['Now', 'Gone'])
    expect(q(root, '.empty')).toBeNull()
    // Tomorrow: no overdue section even though "Late" is still open.
    nav(root).dispatchEvent(new CustomEvent('dayChange', { detail: t.addDays(1), bubbles: true }))
    await flush(); await waitForChanges()
    expect(q(root, '.section-label.overdue')).toBeNull()
    expect(q(root, '.empty')).not.toBeNull()
  })

  it('row events call the store with today and announce', async () => {
    const t = today()
    const a = new Task({ title: 'A', due: t })
    const b = new Task({ title: 'B', due: t })
    const c = new Task({ title: 'C', due: t })
    const store = await fakeStore([a, b, c])
    const { root, waitForChanges } = await render(<oyl-planner store={store} tz="UTC" />)
    const rows = qa(root, 'oyl-plan-row')
    rows[0].dispatchEvent(new CustomEvent('completePlan', { detail: a.id, bubbles: true }))
    await flush(); await waitForChanges()
    expect(store.complete).toHaveBeenCalledWith(a.id, expect.objectContaining({ value: t.value }))
    expect(navQ(root, '[aria-live]')).toHaveTextContent('Completed')
    // The store mutated the plan in place; the row must still re-render as done.
    expect(q(root, 'oyl-plan-row')!.shadowRoot!.querySelector('button.check')).toHaveAttribute('aria-checked', 'true')
    rows[1].dispatchEvent(new CustomEvent('cancelPlan', { detail: b.id, bubbles: true }))
    await flush(); await waitForChanges()
    expect(store.cancel).toHaveBeenCalledWith(b.id)
    expect(navQ(root, '[aria-live]')).toHaveTextContent('Canceled')
    rows[2].dispatchEvent(new CustomEvent('remove', { detail: c.id, bubbles: true }))
    await flush(); await waitForChanges()
    expect(store.remove).toHaveBeenCalledWith(c.id)
    expect(navQ(root, '[aria-live]')).toHaveTextContent('Deleted')
    expect(qa(root, 'oyl-plan-row')).toHaveLength(2)
  })

  it('announces an added plan and passes the day to the composer', async () => {
    const store = await fakeStore()
    const { root, waitForChanges } = await render(<oyl-planner store={store} tz="UTC" />)
    expect((q(root, 'oyl-plan-composer') as any).day.value).toBe(today().value)
    q(root, 'oyl-plan-composer')!.dispatchEvent(new CustomEvent('added', { bubbles: true }))
    await waitForChanges()
    expect(navQ(root, '[aria-live]')).toHaveTextContent('Added to plan')
  })

  it('arrow keys move days unless focus is in a field', async () => {
    const store = await fakeStore()
    const { root, waitForChanges } = await render(<oyl-planner store={store} tz="UTC" />)
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await flush(); await waitForChanges()
    expect(navQ(root, '.rel')).toHaveTextContent('Tomorrow')
    const input = q(root, 'oyl-plan-composer')!.shadowRoot!.querySelector('ui-field[name="title"]')!.shadowRoot!.querySelector('input')!
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, composed: true }))
    await flush(); await waitForChanges()
    expect(navQ(root, '.rel')).toHaveTextContent('Tomorrow')
  })

  it('marks strip days that have open plans', async () => {
    const t = today()
    const store = await fakeStore([new Task({ title: 'Soon', due: t.addDays(2) })])
    const { root } = await render(<oyl-planner store={store} tz="UTC" />)
    const dotted = [...nav(root).shadowRoot!.querySelectorAll('[data-day]')].filter((p) => p.querySelector('.dot')).map((p) => p.getAttribute('data-day'))
    expect(dotted).toEqual([t.addDays(2).value])
  })
})
