import { render, h, describe, it, expect, vi } from '@stencil/vitest'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const field = (root: HTMLElement, name: string) => q(root, `ui-field[name="${name}"]`) as HTMLElement & { value: string; error?: string }
const submit = (root: HTMLElement) => { const f = q(root, 'form')!; const ev = f.ownerDocument.createEvent('Event'); ev.initEvent('submit', true, true); f.dispatchEvent(ev) }
const flush = () => new Promise((r) => setTimeout(r, 0))
const store = () => ({ add: vi.fn(async (c: unknown) => c) })

describe('oyl-consumable-form', () => {
  it('renders the name and the five nutrient fields', async () => {
    const { root } = await render(<oyl-consumable-form store={store()} />)
    expect(field(root, 'name')).not.toBeNull()
    for (const n of ['calories', 'protein', 'totalCarbohydrate', 'totalFat', 'waterMl']) expect(field(root, n)).toHaveAttribute('type', 'number')
  })

  it('submits a Consumable with a derived slug and only the filled facts, clears, emits added', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-consumable-form store={s} />)
    const added = vi.fn()
    root.addEventListener('added', added)
    field(root, 'name').value = 'Steel-cut Oats'
    field(root, 'calories').value = '150'
    field(root, 'protein').value = '5.5'
    submit(root)
    await flush(); await waitForChanges()
    expect(s.add).toHaveBeenCalledTimes(1)
    const c = s.add.mock.calls[0][0] as any
    expect(c.name).toBe('Steel-cut Oats')
    expect(c.slug).toBe('steel_cut_oats')
    expect(c.facts).toEqual({ calories: 150, protein: 5.5 })
    expect(added).toHaveBeenCalledTimes(1)
    expect(field(root, 'name').value).toBe('')
    expect(field(root, 'calories').value).toBe('')
  })

  it('an empty name shows the domain error and marks the name invalid', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-consumable-form store={s} />)
    submit(root)
    await flush(); await waitForChanges()
    expect(s.add).not.toHaveBeenCalled()
    expect(q(root, '[data-role="error"]')!.textContent).toMatch(/non-empty/)
    expect(field(root, 'name').error).toMatch(/non-empty/)
  })
})
