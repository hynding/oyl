import { render, h, describe, it, expect, vi } from '@stencil/vitest'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const field = (root: HTMLElement, name: string) => q(root, `ui-field[name="${name}"]`) as HTMLElement & { value: string; error?: string }
const submit = (root: HTMLElement) => { const f = q(root, 'form')!; const ev = f.ownerDocument.createEvent('Event'); ev.initEvent('submit', true, true); f.dispatchEvent(ev) }
const flush = () => new Promise((r) => setTimeout(r, 0))
const store = () => ({ addContact: vi.fn(async (c: unknown) => c) })

describe('oyl-contact-form', () => {
  it('builds a Contact with a yearly birthday occasion and last-contacted day', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-contact-form store={s} />)
    const added = vi.fn()
    root.addEventListener('added', added)
    field(root, 'name').value = 'Alex Friend'
    field(root, 'birthday').value = '1990-03-14'
    field(root, 'lastContacted').value = '2026-10-01'
    submit(root)
    await flush(); await waitForChanges()
    const c = s.addContact.mock.calls[0][0] as any
    expect(c.name).toBe('Alex Friend')
    expect(c.lastContactedOn.value).toBe('2026-10-01')
    expect(c.occasions).toHaveLength(1)
    expect(c.occasions[0].name).toBe('birthday')
    expect(c.occasions[0].anchor.value).toBe('1990-03-14')
    expect(c.occasions[0].cadence.unit).toBe('years')
    expect(added).toHaveBeenCalledTimes(1)
    expect(field(root, 'name').value).toBe('')
  })

  it('blank optionals mean no occasions and no last-contacted day', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-contact-form store={s} />)
    field(root, 'name').value = 'Sam'
    submit(root)
    await flush(); await waitForChanges()
    const c = s.addContact.mock.calls[0][0] as any
    expect(c.occasions).toEqual([])
    expect(c.lastContactedOn).toBeUndefined()
  })

  it('an empty name shows the domain error inline', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-contact-form store={s} />)
    submit(root)
    await flush(); await waitForChanges()
    expect(s.addContact).not.toHaveBeenCalled()
    expect(field(root, 'name').error).toMatch(/non-empty/)
  })
})
