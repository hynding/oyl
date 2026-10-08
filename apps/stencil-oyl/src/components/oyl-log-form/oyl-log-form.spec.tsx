import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { DayKey } from '@oyl/all-of-oyl'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const field = (root: HTMLElement, name: string) => q(root, `ui-field[name="${name}"]`) as HTMLElement & { value: string }
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
/** The segment's option buttons live in ui-segment's own shadow root. */
const segOption = (root: HTMLElement, value: string) => q(root, 'ui-segment')!.shadowRoot!.querySelector(`[data-value="${value}"]`)!
const submit = (root: HTMLElement) => { const f = q(root, 'form')!; const ev = f.ownerDocument.createEvent('Event'); ev.initEvent('submit', true, true); f.dispatchEvent(ev) }
const flush = () => new Promise((r) => setTimeout(r, 0))
const day = DayKey.of('2026-10-08')
const store = () => ({ add: vi.fn(async (e: unknown) => e) })

describe('oyl-log-form', () => {
  it('defaults to a note with the when field prefilled for the shown day', async () => {
    const { root } = await render(<oyl-log-form store={store()} day={day} />)
    expect((q(root, 'ui-segment') as any).value).toBe('note')
    expect(q(root, 'ui-textarea[name="text"]')).not.toBeNull()
    expect(field(root, 'tags')).not.toBeNull()
    expect(q(root, 'select[name="metric"]')).toBeNull()
    const when = field(root, 'when')
    expect(when).toHaveAttribute('type', 'datetime-local')
    expect(when.value).toMatch(/^2026-10-08T\d{2}:\d{2}$/)
  })

  it('switching to measurement shows metric + value; custom reveals its field', async () => {
    const { root, waitForChanges } = await render(<oyl-log-form store={store()} day={day} />)
    click(segOption(root, 'measurement'))
    await waitForChanges()
    expect(q(root, 'ui-textarea[name="text"]')).toBeNull()
    const metric = q(root, 'select[name="metric"]') as HTMLSelectElement
    expect(metric).not.toBeNull()
    expect(field(root, 'value')).toHaveAttribute('type', 'number')
    expect(field(root, 'custom')).toBeNull()
    metric.value = 'custom'
    { const ev = metric.ownerDocument.createEvent('Event'); ev.initEvent('change', true, false); metric.dispatchEvent(ev) }
    await waitForChanges()
    expect(field(root, 'custom')).not.toBeNull()
  })

  it('submits a note with parsed tags, emits logged and resets', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-log-form store={s} day={day} />)
    const logged = vi.fn()
    root.addEventListener('logged', logged)
    ;(q(root, 'ui-textarea[name="text"]') as any).value = 'Walked the long way home'
    field(root, 'tags').value = 'walking, evening'
    submit(root)
    await flush(); await waitForChanges()
    expect(s.add).toHaveBeenCalledTimes(1)
    const entry = s.add.mock.calls[0][0] as any
    expect(entry.kind).toBe('note')
    expect(entry.text).toBe('Walked the long way home')
    expect([...entry.tags]).toEqual(['walking', 'evening'])
    // `when` is local wall time: compare in local terms, not UTC.
    const d = entry.occurredAt as Date
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 10, 8])
    expect(logged).toHaveBeenCalledTimes(1)
    expect((q(root, 'ui-textarea[name="text"]') as any).value).toBe('')
  })

  it('submits a measurement from the select or the custom key', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-log-form store={s} day={day} />)
    click(segOption(root, 'measurement'))
    await waitForChanges()
    ;(q(root, 'select[name="metric"]') as HTMLSelectElement).value = 'body.weight_kg'
    field(root, 'value').value = '81.5'
    submit(root)
    await flush(); await waitForChanges()
    let entry = s.add.mock.calls[0][0] as any
    expect(entry.kind).toBe('measurement')
    expect(String(entry.metric)).toBe('body.weight_kg')
    expect(entry.value).toBe(81.5)
    const metric = q(root, 'select[name="metric"]') as HTMLSelectElement
    metric.value = 'custom'
    const ev = metric.ownerDocument.createEvent('Event'); ev.initEvent('change', true, false); metric.dispatchEvent(ev)
    await waitForChanges()
    field(root, 'custom').value = 'custom.pushups'
    field(root, 'value').value = '30'
    submit(root)
    await flush(); await waitForChanges()
    entry = s.add.mock.calls[1][0] as any
    expect(String(entry.metric)).toBe('custom.pushups')
    expect(entry.value).toBe(30)
  })

  it('shows a domain error in the live region and marks the field invalid', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-log-form store={s} day={day} />)
    submit(root) // empty note text → Note throws
    await flush(); await waitForChanges()
    expect(s.add).not.toHaveBeenCalled()
    const err = q(root, '[data-role="error"]')!
    expect(err).toHaveAttribute('aria-live', 'polite')
    expect(err.textContent).toMatch(/non-empty/)
    expect((q(root, 'ui-textarea[name="text"]') as any).error).toMatch(/non-empty/)
  })

  it('renders live tag chips, flagging invalid ones', async () => {
    const { root, waitForChanges } = await render(<oyl-log-form store={store()} day={day} />)
    field(root, 'tags').dispatchEvent(new CustomEvent('uiInput', { detail: { value: 'good Bad' }, bubbles: true, composed: true }))
    await waitForChanges()
    const chips = [...root.shadowRoot!.querySelectorAll('.chip')]
    expect(chips.map((c) => [c.textContent, c.classList.contains('bad')])).toEqual([['good', false], ['Bad', true]])
  })

  it('uiSubmit from the textarea submits the form', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-log-form store={s} day={day} />)
    ;(q(root, 'ui-textarea[name="text"]') as any).value = 'Quick'
    q(root, 'ui-textarea[name="text"]')!.dispatchEvent(new CustomEvent('uiSubmit', { bubbles: true, composed: true }))
    await flush(); await waitForChanges()
    expect(s.add).toHaveBeenCalledTimes(1)
  })
})
