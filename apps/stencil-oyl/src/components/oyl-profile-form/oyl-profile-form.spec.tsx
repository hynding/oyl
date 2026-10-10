import { render, h, describe, it, expect, vi } from '@stencil/vitest'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const field = (root: HTMLElement, name: string) => q(root, `ui-field[name="${name}"]`) as (HTMLElement & { value: string; hint?: string }) | null
const select = (root: HTMLElement, name: string) => q(root, `ui-select[name="${name}"]`) as (HTMLElement & { value: string; options: { value: string; label: string }[] }) | null
const pick = (root: HTMLElement, name: string, value: string) => select(root, name)!.dispatchEvent(new CustomEvent('uiChange', { detail: { value }, bubbles: true, composed: true }))
const submit = (root: HTMLElement) => { const f = q(root, 'form')!; const ev = f.ownerDocument.createEvent('Event'); ev.initEvent('submit', true, true); f.dispatchEvent(ev) }
const flush = () => new Promise((r) => setTimeout(r, 0))
const ZONES = ['UTC', 'America/Los_Angeles', 'Europe/Paris']

describe('oyl-profile-form', () => {
  it('seeds every field from the value in the stored units', async () => {
    const value = { timezone: 'Europe/Paris', units: 'imperial' as const, birthday: '1990-06-15', weightKg: 81.5, heightCm: 179.5, location: 'Berlin' }
    const { root } = await render(<oyl-profile-form value={value} zones={ZONES} />)
    expect(select(root, 'timezone')!.options.map((o) => o.value)).toEqual(ZONES)
    expect(select(root, 'timezone')!.value).toBe('Europe/Paris')
    expect(select(root, 'units')!.value).toBe('imperial')
    expect(field(root, 'birthday')!.value).toBe('1990-06-15')
    expect(field(root, 'birthday')).toHaveAttribute('type', 'date')
    expect(field(root, 'weight')!.value).toBe('179.7')
    expect(field(root, 'weight')!.hint).toBe('lb')
    expect(field(root, 'height')!.value).toBe('70.7')
    expect(field(root, 'height')!.hint).toBe('in')
    expect(field(root, 'location')!.value).toBe('Berlin')
    expect(select(root, 'gender')!.value).toBe('')
    expect(field(root, 'genderOther')).toBeNull()
  })

  it('an unlisted timezone keeps its own option; no zones → a text field; a custom gender reveals self-describe', async () => {
    const listed = await render(<oyl-profile-form value={{ timezone: 'Asia/Calcutta', gender: 'agender' }} zones={ZONES} />)
    expect(select(listed.root, 'timezone')!.options.map((o) => o.value)).toEqual(['Asia/Calcutta', ...ZONES])
    expect(select(listed.root, 'timezone')!.value).toBe('Asia/Calcutta')
    expect(select(listed.root, 'gender')!.value).toBe('__other__')
    expect(field(listed.root, 'genderOther')!.value).toBe('agender')
    const text = await render(<oyl-profile-form value={{ timezone: 'Europe/Paris' }} zones={null} />)
    expect(select(text.root, 'timezone')).toBeNull()
    expect(field(text.root, 'timezone')!.value).toBe('Europe/Paris')
    expect(field(text.root, 'weight')!.hint).toBe('kg')
  })

  it('units flip the hints without converting; gender Other reveals and hides the self-describe field', async () => {
    const { root, waitForChanges } = await render(<oyl-profile-form value={{ units: 'metric', weightKg: 81.5 }} zones={ZONES} />)
    pick(root, 'units', 'imperial')
    await waitForChanges()
    expect(field(root, 'weight')!.hint).toBe('lb')
    expect(field(root, 'height')!.hint).toBe('in')
    expect(field(root, 'weight')!.value).toBe('81.5')
    pick(root, 'gender', '__other__')
    await waitForChanges()
    expect(field(root, 'genderOther')).not.toBeNull()
    pick(root, 'gender', 'male')
    await waitForChanges()
    expect(field(root, 'genderOther')).toBeNull()
  })

  it('submit emits the patch (metric, imperial, self-described gender; blanks omitted)', async () => {
    const { root, waitForChanges } = await render(<oyl-profile-form value={{ timezone: 'Europe/Paris' }} zones={ZONES} />)
    const saved = vi.fn()
    root.addEventListener('save', (e) => saved((e as CustomEvent).detail))
    field(root, 'birthday')!.value = '1990-06-15'
    field(root, 'weight')!.value = '81.5'
    field(root, 'height')!.value = '179.5'
    field(root, 'location')!.value = ' Berlin '
    submit(root)
    await flush(); await waitForChanges()
    expect(saved).toHaveBeenLastCalledWith({ timezone: 'Europe/Paris', units: 'metric', birthday: '1990-06-15', weightKg: 81.5, heightCm: 179.5, location: 'Berlin' })

    pick(root, 'units', 'imperial')
    pick(root, 'timezone', 'UTC')
    pick(root, 'gender', '__other__')
    await waitForChanges()
    field(root, 'weight')!.value = '180'
    field(root, 'height')!.value = '70'
    field(root, 'genderOther')!.value = ' agender '
    field(root, 'location')!.value = ''
    submit(root)
    await flush(); await waitForChanges()
    expect(saved).toHaveBeenLastCalledWith({ timezone: 'UTC', units: 'imperial', birthday: '1990-06-15', weightKg: 81.6, heightCm: 177.8, gender: 'agender' })
  })

  it('a new value re-seeds (custom gender and another unlisted zone included); the same value leaves typing alone', async () => {
    const value = { timezone: 'UTC' }
    const { root, waitForChanges } = await render(<oyl-profile-form value={value} zones={ZONES} />)
    const form = q(root, 'form')!.getRootNode() as ShadowRoot
    field(root, 'weight')!.value = '70'
    ;(form.host as any).value = value
    await waitForChanges()
    expect(field(root, 'weight')!.value).toBe('70')
    ;(form.host as any).value = { timezone: 'Asia/Calcutta', units: 'metric', weightKg: 81.5, gender: 'agender' }
    await waitForChanges()
    expect(select(root, 'timezone')!.options[0]!.value).toBe('Asia/Calcutta')
    expect(select(root, 'timezone')!.value).toBe('Asia/Calcutta')
    expect(field(root, 'weight')!.value).toBe('81.5')
    expect(select(root, 'gender')!.value).toBe('__other__')
    expect(field(root, 'genderOther')!.value).toBe('agender')
  })
})
