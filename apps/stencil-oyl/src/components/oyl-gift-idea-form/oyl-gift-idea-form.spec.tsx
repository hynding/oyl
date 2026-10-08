import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { Contact } from '@oyl/all-of-oyl'
import { core } from '../../../vitest-setup.js'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const field = (root: HTMLElement, name: string) => q(root, `ui-field[name="${name}"]`) as HTMLElement & { value: string; error?: string }
const select = (root: HTMLElement, name: string) => q(root, `ui-select[name="${name}"]`) as (HTMLElement & { value: string; options: { value: string; label: string }[] }) | null
const pick = (root: HTMLElement, name: string, value: string) => select(root, name)!.dispatchEvent(new CustomEvent('uiChange', { detail: { value }, bubbles: true, composed: true }))
const submit = (root: HTMLElement) => { const f = q(root, 'form')!; const ev = f.ownerDocument.createEvent('Event'); ev.initEvent('submit', true, true); f.dispatchEvent(ev) }
const flush = () => new Promise((r) => setTimeout(r, 0))

const alex = new Contact({ name: 'Alex' })
const sam = new Contact({ name: 'Sam' })

async function store(contacts: Contact[] = []) {
  const { signal } = await core()
  const rev = signal(0)
  const list = [...contacts]
  return {
    contacts: () => { rev.get(); return [...list] },
    addContact: vi.fn(async (c: Contact) => { list.push(c); rev.set(rev.get() + 1); return c }),
    addGiftIdea: vi.fn(async (g: unknown) => g),
  }
}

describe('oyl-gift-idea-form', () => {
  it('without contacts shows the hint and no fields; a first contact switches to the fields and is adopted', async () => {
    const s = await store()
    const { root, waitForChanges } = await render(<oyl-gift-idea-form store={s} />)
    expect(q(root, '.hint')).toHaveTextContent('Add a contact first.')
    expect(field(root, 'giftText')).toBeNull()
    await s.addContact(alex)
    await flush(); await waitForChanges()
    expect(q(root, '.hint')).toBeNull()
    expect(select(root, 'giftContact')!.options).toEqual([{ value: alex.id, label: 'Alex' }])
    field(root, 'giftText').value = 'Teapot'
    submit(root)
    await flush(); await waitForChanges()
    const g = s.addGiftIdea.mock.calls[0][0] as any
    expect(g.text).toBe('Teapot')
    expect(g.contactId).toBe(alex.id)
  })

  it('keeps the chosen contact when the list grows, builds a GiftIdea, clears and emits added', async () => {
    const s = await store([alex, sam])
    const { root, waitForChanges } = await render(<oyl-gift-idea-form store={s} />)
    const added = vi.fn()
    root.addEventListener('added', added)
    pick(root, 'giftContact', sam.id)
    await s.addContact(new Contact({ name: 'Kim' }))
    await flush(); await waitForChanges()
    field(root, 'giftText').value = 'Fancy teapot'
    submit(root)
    await flush(); await waitForChanges()
    const g = s.addGiftIdea.mock.calls[0][0] as any
    expect(g.contactId).toBe(sam.id)
    expect(added).toHaveBeenCalledTimes(1)
    expect(field(root, 'giftText').value).toBe('')
  })

  it('an empty idea shows the domain error inline', async () => {
    const s = await store([alex])
    const { root, waitForChanges } = await render(<oyl-gift-idea-form store={s} />)
    submit(root)
    await flush(); await waitForChanges()
    expect(s.addGiftIdea).not.toHaveBeenCalled()
    expect(field(root, 'giftText').error).toMatch(/non-empty/)
  })
})
