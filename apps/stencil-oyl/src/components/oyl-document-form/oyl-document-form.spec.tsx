import { render, h, describe, it, expect, vi } from '@stencil/vitest'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const field = (root: HTMLElement, name: string) => q(root, `ui-field[name="${name}"]`) as HTMLElement & { value: string; error?: string }
const submit = (root: HTMLElement) => { const f = q(root, 'form')!; const ev = f.ownerDocument.createEvent('Event'); ev.initEvent('submit', true, true); f.dispatchEvent(ev) }
const flush = () => new Promise((r) => setTimeout(r, 0))
const store = () => ({ addDocument: vi.fn(async (d: unknown) => d) })

describe('oyl-document-form', () => {
  it('builds a Document with an optional expiry, clears and emits added', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-document-form store={s} />)
    const added = vi.fn()
    root.addEventListener('added', added)
    expect(field(root, 'expiresOn')).toHaveAttribute('type', 'date')
    field(root, 'name').value = 'Passport'
    field(root, 'kind').value = 'id'
    field(root, 'expiresOn').value = '2026-11-07'
    submit(root)
    await flush(); await waitForChanges()
    const d = s.addDocument.mock.calls[0][0] as any
    expect(d.name).toBe('Passport')
    expect(d.kind).toBe('id')
    expect(d.expiresOn.value).toBe('2026-11-07')
    expect(added).toHaveBeenCalledTimes(1)
    expect(field(root, 'name').value).toBe('')
    field(root, 'name').value = 'Lease'
    field(root, 'kind').value = 'contract'
    submit(root)
    await flush(); await waitForChanges()
    expect((s.addDocument.mock.calls[1][0] as any).expiresOn).toBeUndefined()
  })

  it('marks the field the domain error names', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-document-form store={s} />)
    field(root, 'name').value = 'Passport'
    submit(root)
    await flush(); await waitForChanges()
    expect(s.addDocument).not.toHaveBeenCalled()
    expect(q(root, '[data-role="error"]')!.textContent).toMatch(/kind must be non-empty/)
    expect(field(root, 'kind').error).toMatch(/kind/)
    expect(field(root, 'name').error).toBeUndefined()
    field(root, 'name').value = ''
    submit(root)
    await flush(); await waitForChanges()
    expect(field(root, 'name').error).toMatch(/name/)
  })
})
