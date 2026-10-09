import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { DayKey } from '@oyl/all-of-oyl'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const field = (root: HTMLElement, name: string) => q(root, `ui-field[name="${name}"]`) as HTMLElement & { value: string; error?: string }
const checkbox = (root: HTMLElement) => q(root, 'ui-checkbox[name="repeat"]') as HTMLElement & { checked: boolean }
const unit = (root: HTMLElement) => q(root, 'select[name="repeatUnit"]') as HTMLSelectElement
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
const segOption = (root: HTMLElement, value: string) => q(root, 'ui-segment')!.shadowRoot!.querySelector(`[data-value="${value}"]`)!
const submit = (root: HTMLElement) => { const f = q(root, 'form')!; const ev = f.ownerDocument.createEvent('Event'); ev.initEvent('submit', true, true); f.dispatchEvent(ev) }
const flush = () => new Promise((r) => setTimeout(r, 0))
const setRepeat = (root: HTMLElement, checked: boolean) => checkbox(root).dispatchEvent(new CustomEvent('uiChange', { detail: { checked }, bubbles: true, composed: true }))
const day = DayKey.of('2026-10-08')
const store = () => ({ add: vi.fn(async (p: unknown) => p) })

describe('oyl-plan-composer', () => {
  it('defaults to a task: title, due prefilled with the day, repeat controls disabled', async () => {
    const { root } = await render(<oyl-plan-composer store={store()} tz="UTC" day={day} />)
    expect((q(root, 'ui-segment') as any).value).toBe('task')
    expect(field(root, 'title')).not.toBeNull()
    expect(field(root, 'due')).toHaveAttribute('type', 'date')
    expect(field(root, 'due').value).toBe('2026-10-08')
    expect(checkbox(root).checked).toBe(false)
    expect((field(root, 'repeatN') as any).disabled).toBe(true)
    expect(unit(root).disabled).toBe(true)
    expect([...unit(root).options].map((o) => o.value)).toEqual(['days', 'weeks', 'months', 'years'])
    expect(field(root, 'startsAt')).toBeNull()
  })

  it('checking Repeat enables the interval and unit', async () => {
    const { root, waitForChanges } = await render(<oyl-plan-composer store={store()} tz="UTC" day={day} />)
    setRepeat(root, true)
    await waitForChanges()
    expect((field(root, 'repeatN') as any).disabled).toBe(false)
    expect(unit(root).disabled).toBe(false)
  })

  it('switching to appointment shows starts/duration with the start prefilled at 09:00', async () => {
    const { root, waitForChanges } = await render(<oyl-plan-composer store={store()} tz="UTC" day={day} />)
    click(segOption(root, 'appointment'))
    await waitForChanges()
    expect(field(root, 'due')).toBeNull()
    expect(field(root, 'startsAt')).toHaveAttribute('type', 'datetime-local')
    expect(field(root, 'startsAt').value).toBe('2026-10-08T09:00')
    expect(field(root, 'duration')).toHaveAttribute('type', 'number')
  })

  it('submits a task with due and cadence, emits added and resets', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-plan-composer store={s} tz="UTC" day={day} />)
    const added = vi.fn()
    root.addEventListener('added', added)
    field(root, 'title').value = 'Weekly review'
    field(root, 'due').value = '2026-10-09'
    setRepeat(root, true)
    await waitForChanges()
    field(root, 'repeatN').value = '2'
    unit(root).value = 'weeks'
    submit(root)
    await flush(); await waitForChanges()
    expect(s.add).toHaveBeenCalledTimes(1)
    const plan = s.add.mock.calls[0][0] as any
    expect(plan.kind).toBe('task')
    expect(plan.title).toBe('Weekly review')
    expect(plan.due.value).toBe('2026-10-09')
    expect(plan.cadence.n).toBe(2)
    expect(plan.cadence.unit).toBe('weeks')
    expect(added).toHaveBeenCalledTimes(1)
    expect(field(root, 'title').value).toBe('')
    expect(field(root, 'due').value).toBe('2026-10-08')
    expect(checkbox(root).checked).toBe(false)
    expect(unit(root).disabled).toBe(true)
  })

  it('a task without Repeat has no cadence', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-plan-composer store={s} tz="UTC" day={day} />)
    field(root, 'title').value = 'Once'
    submit(root)
    await flush(); await waitForChanges()
    const plan = s.add.mock.calls[0][0] as any
    expect(plan.cadence).toBeUndefined()
    expect(plan.due.value).toBe('2026-10-08')
  })

  it('submits an appointment with start, duration and tz', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-plan-composer store={s} tz="UTC" day={day} />)
    click(segOption(root, 'appointment'))
    await waitForChanges()
    field(root, 'title').value = 'Dentist'
    field(root, 'startsAt').value = '2026-10-08T14:30'
    field(root, 'duration').value = '45'
    submit(root)
    await flush(); await waitForChanges()
    const plan = s.add.mock.calls[0][0] as any
    expect(plan.kind).toBe('appointment')
    expect(plan.title).toBe('Dentist')
    expect(plan.durationMinutes).toBe(45)
    const d = plan.startsAt as Date
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 8, 14, 30])
    expect(field(root, 'startsAt').value).toBe('2026-10-08T09:00')
  })

  it('shows a domain error in the live region and marks the title invalid', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-plan-composer store={s} tz="UTC" day={day} />)
    submit(root) // empty title → Plan throws
    await flush(); await waitForChanges()
    expect(s.add).not.toHaveBeenCalled()
    const err = q(root, '[data-role="error"]')!
    expect(err).toHaveAttribute('aria-live', 'polite')
    expect(err.textContent).toMatch(/non-empty/)
    expect(field(root, 'title').error).toMatch(/non-empty/)
  })

  it('⌘/Ctrl+Enter submits the form', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-plan-composer store={s} tz="UTC" day={day} />)
    field(root, 'title').value = 'Quick'
    q(root, 'form')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, composed: true }))
    await flush(); await waitForChanges()
    expect(s.add).toHaveBeenCalledTimes(1)
  })

  it('re-syncs due and start when the day changes', async () => {
    const { root, waitForChanges } = await render(<oyl-plan-composer store={store()} tz="UTC" day={day} />)
    ;(root as any).day = DayKey.of('2026-10-10')
    await waitForChanges()
    expect(field(root, 'due').value).toBe('2026-10-10')
    click(segOption(root, 'appointment'))
    await waitForChanges()
    expect(field(root, 'startsAt').value).toBe('2026-10-10T09:00')
  })
})
