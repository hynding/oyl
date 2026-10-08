import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { DayKey, Note, Measurement, Transaction, Money } from '@oyl/all-of-oyl'
import { formatDayHeading } from '@oyl/all-of-oyl/format'
import { core } from '../../../vitest-setup.js'

// The day navigation (h2, .rel, [data-day], [data-nav], [aria-live]) renders inside the
// nested oyl-day-nav; fall through to its shadow root, as Playwright's piercing does.
const nav = (root: HTMLElement) => root.shadowRoot!.querySelector('oyl-day-nav')?.shadowRoot ?? null
const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel) ?? nav(root)?.querySelector(sel) ?? null
const qa = (root: HTMLElement, sel: string) => { const own = [...root.shadowRoot!.querySelectorAll(sel)]; return own.length ? own : [...(nav(root)?.querySelectorAll(sel) ?? [])] }
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
const inner = (el: Element) => el.shadowRoot?.querySelector('button') ?? el
const flush = () => new Promise((r) => setTimeout(r, 0))
const today = () => DayKey.from(new Date(), 'UTC')

/** A journal store fake over a day-keyed map, reactive through the bundle's signal. */
async function fakeStore(byDay: Record<string, unknown[]> = {}) {
  const { signal } = await core()
  const revision = signal(0)
  const data = new Map(Object.entries(byDay))
  return {
    revision,
    entriesOn: (day: DayKey) => { revision.get(); return (data.get(day.value) ?? []) as any[] },
    add: vi.fn(async (e: any) => { const k = DayKey.from(e.occurredAt, 'UTC').value; data.set(k, [...(data.get(k) ?? []), e]); revision.set(revision.get() + 1); return e }),
    remove: vi.fn(async (id: string) => { for (const [k, v] of data) data.set(k, v.filter((e: any) => e.id !== id)); revision.set(revision.get() + 1) }),
  }
}

describe('oyl-journal', () => {
  it('shows today with the relative label, the week strip and the empty state', async () => {
    const store = await fakeStore()
    const { root } = await render(<oyl-journal store={store} tz="UTC" />)
    expect(q(root, 'h2')).toHaveTextContent(formatDayHeading(today()))
    expect(q(root, '.rel')).toHaveTextContent('Today')
    const pills = qa(root, '[data-day]')
    expect(pills).toHaveLength(7)
    expect(pills[3]).toHaveAttribute('aria-pressed', 'true')
    expect(pills[3].getAttribute('data-day')).toBe(today().value)
    expect(q(root, '.empty')).toHaveTextContent(`Nothing logged for ${formatDayHeading(today())}`)
  })

  it('prev/next and the week pills move the day; the heading takes focus', async () => {
    const store = await fakeStore()
    const { root, waitForChanges } = await render(<oyl-journal store={store} tz="UTC" />)
    click(inner(q(root, 'ui-button[data-nav="prev"]')!))
    await flush(); await waitForChanges()
    const yesterday = today().addDays(-1)
    expect(q(root, 'h2')).toHaveTextContent(formatDayHeading(yesterday))
    expect(q(root, '.rel')).toHaveTextContent('Yesterday')
    expect(q(root, `[data-day="${yesterday.value}"]`)).toHaveAttribute('aria-pressed', 'true')
    click(inner(q(root, 'ui-button[data-nav="next"]')!))
    await flush(); await waitForChanges()
    expect(q(root, '.rel')).toHaveTextContent('Today')
    click(q(root, `[data-day="${today().addDays(2).value}"]`)!)
    await flush(); await waitForChanges()
    expect(q(root, 'h2')).toHaveTextContent(formatDayHeading(today().addDays(2)))
  })

  it('arrow keys move days unless focus is in a field', async () => {
    const store = await fakeStore()
    const { root, waitForChanges } = await render(<oyl-journal store={store} tz="UTC" />)
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await flush(); await waitForChanges()
    expect(q(root, '.rel')).toHaveTextContent('Yesterday')
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await flush(); await waitForChanges()
    expect(q(root, '.rel')).toHaveTextContent('Today')
    // From inside the composer's textarea: ignored.
    const ta = q(root, 'oyl-log-form')!.shadowRoot!.querySelector('ui-textarea')!.shadowRoot!.querySelector('textarea')!
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, composed: true }))
    await flush(); await waitForChanges()
    expect(q(root, '.rel')).toHaveTextContent('Today')
  })

  it('lists only notes and measurements, newest first, and reacts to removal', async () => {
    const t = today()
    const at = (h: number) => new Date(`${t.value}T${String(h).padStart(2, '0')}:00:00Z`)
    const note = new Note({ occurredAt: at(7), text: 'Run' })
    const meas = new Measurement({ occurredAt: at(8), metric: 'body.weight_kg', value: 78 })
    const tx = new Transaction({ occurredAt: at(9), amount: Money.of(5, 'USD'), category: 'food', direction: 'expense' })
    const store = await fakeStore({ [t.value]: [note, meas, tx] })
    const { root, waitForChanges } = await render(<oyl-journal store={store} tz="UTC" />)
    const rows = qa(root, 'oyl-entry-row') as (HTMLElement & { entry: any })[]
    expect(rows.map((r) => r.entry.kind)).toEqual(['measurement', 'note'])
    expect(q(root, '.empty')).toBeNull()
    rows[1].dispatchEvent(new CustomEvent('remove', { detail: note.id, bubbles: true }))
    await flush(); await waitForChanges()
    expect(store.remove).toHaveBeenCalledWith(note.id)
    expect(qa(root, 'oyl-entry-row')).toHaveLength(1)
    expect(q(root, '[aria-live]')).toHaveTextContent('Entry deleted')
  })

  it('announces a logged entry', async () => {
    const store = await fakeStore()
    const { root, waitForChanges } = await render(<oyl-journal store={store} tz="UTC" />)
    q(root, 'oyl-log-form')!.dispatchEvent(new CustomEvent('logged', { bubbles: true }))
    await waitForChanges()
    expect(q(root, '[aria-live]')).toHaveTextContent('Entry added')
  })
})
