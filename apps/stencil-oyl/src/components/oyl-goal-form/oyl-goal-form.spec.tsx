import { render, h, describe, it, expect, vi } from '@stencil/vitest'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const field = (root: HTMLElement, name: string) => q(root, `ui-field[name="${name}"]`) as HTMLElement & { value: string; error?: string; hint?: string }
const select = (root: HTMLElement, name: string) => q(root, `ui-select[name="${name}"]`) as HTMLElement & { value: string; options: { value: string; label: string }[] }
const pick = (root: HTMLElement, name: string, value: string) => select(root, name).dispatchEvent(new CustomEvent('uiChange', { detail: { value }, bubbles: true, composed: true }))
const submit = (root: HTMLElement) => { const f = q(root, 'form')!; const ev = f.ownerDocument.createEvent('Event'); ev.initEvent('submit', true, true); f.dispatchEvent(ev) }
const flush = () => new Promise((r) => setTimeout(r, 0))
const store = () => ({ add: vi.fn(async (g: unknown) => g) })

describe('oyl-goal-form', () => {
  it('offers the five presets, an optional name, a target with a unit hint and a period', async () => {
    const { root } = await render(<oyl-goal-form store={store()} />)
    expect(select(root, 'preset').options.map((o) => o.label)).toEqual(['Sleep (hours)', 'Weight (kg)', 'Calories', 'Run minutes', 'Screen time (min)'])
    expect(select(root, 'preset').value).toBe('0')
    expect((field(root, 'name') as any).label).toBe('Name (optional)')
    expect(field(root, 'target')).toHaveAttribute('type', 'number')
    expect(field(root, 'target').hint).toBe('h')
    expect(select(root, 'period').options.map((o) => o.value)).toEqual(['day', 'week', 'month'])
    expect(select(root, 'period').value).toBe('day')
  })

  it('a preset sets the period and the unit hint; the period stays editable until the next preset', async () => {
    const { root, waitForChanges } = await render(<oyl-goal-form store={store()} />)
    pick(root, 'preset', '3')
    await waitForChanges()
    expect(select(root, 'period').value).toBe('week')
    expect(field(root, 'target').hint).toBe('min')
    pick(root, 'period', 'month')
    await waitForChanges()
    expect(select(root, 'period').value).toBe('month')
    pick(root, 'preset', '1')
    await waitForChanges()
    expect(select(root, 'period').value).toBe('day')
    expect(field(root, 'target').hint).toBe('kg')
  })

  it("submits a Goal from the preset + the user's target/period/name, clears and emits added", async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-goal-form store={s} />)
    const added = vi.fn()
    root.addEventListener('added', added)
    field(root, 'name').value = 'Sleep more'
    field(root, 'target').value = '7.5'
    submit(root)
    await flush(); await waitForChanges()
    const g = s.add.mock.calls[0][0] as any
    expect(String(g.metric)).toBe('sleep.hours')
    expect(g.direction).toBe('atLeast')
    expect(g.aggregation).toBe('sum')
    expect(g.period).toBe('day')
    expect(g.target).toBe(7.5)
    expect(g.name).toBe('Sleep more')
    expect(added).toHaveBeenCalledTimes(1)
    expect(field(root, 'name').value).toBe('')
    expect(field(root, 'target').value).toBe('')

    pick(root, 'preset', '3')
    pick(root, 'period', 'month')
    field(root, 'target').value = '120'
    submit(root)
    await flush(); await waitForChanges()
    const g2 = s.add.mock.calls[1][0] as any
    expect(String(g2.metric)).toBe('activity.run.minutes')
    expect(g2.period).toBe('month')
    expect(g2.name).toBeUndefined()
  })

  it('a non-positive target shows the domain error inline and marks the field', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-goal-form store={s} />)
    for (const v of ['', '0', '-1']) {
      field(root, 'target').value = v
      submit(root)
      await flush(); await waitForChanges()
      expect(q(root, '[data-role="error"]')!.textContent).toMatch(/positive/)
      expect(field(root, 'target').error).toMatch(/positive/)
    }
    expect(s.add).not.toHaveBeenCalled()
  })

  it('a store rejection lands in the error line', async () => {
    const s = { add: vi.fn(async () => { throw new Error('offline') }) }
    const { root, waitForChanges } = await render(<oyl-goal-form store={s} />)
    field(root, 'target').value = '8'
    submit(root)
    await flush(); await waitForChanges()
    expect(q(root, '[data-role="error"]')!.textContent).toBe('offline')
  })
})
