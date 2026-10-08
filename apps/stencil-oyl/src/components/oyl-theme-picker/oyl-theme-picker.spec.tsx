import { render, h, describe, it, expect } from '@stencil/vitest'
import { core } from '../../../vitest-setup.js'
import type { ThemeSettings } from '../../boot/theme.js'

async function fakeThemeState(initial: ThemeSettings = { theme: 'classic', mode: 'system' }) {
  const { signal } = await core()
  const settings = signal<ThemeSettings>(initial)
  return {
    settings,
    update(change: Partial<ThemeSettings>) { settings.set({ ...settings.get(), ...change }) },
    refresh() {},
  }
}
const flush = () => new Promise((r) => setTimeout(r, 0))
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))

describe('oyl-theme-picker', () => {
  it('shows the current theme on the trigger and opens a panel of 8 themes + 3 modes', async () => {
    const themeState = await fakeThemeState({ theme: 'forest', mode: 'dark' })
    const { root, waitForChanges } = await render(<oyl-theme-picker themeState={themeState} />)
    const sr = root.shadowRoot!
    const trigger = sr.querySelector('button[data-picker-trigger]')!
    expect(trigger).toHaveTextContent('Forest')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(sr.querySelectorAll('.chip')).toHaveLength(3)
    expect((sr.querySelector('[data-picker-panel]') as HTMLElement).hidden).toBe(true)
    click(trigger)
    await waitForChanges()
    expect((sr.querySelector('[data-picker-panel]') as HTMLElement).hidden).toBe(false)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(sr.querySelectorAll('[data-theme-option]')).toHaveLength(8)
    expect(sr.querySelectorAll('[data-mode-option]')).toHaveLength(3)
    expect(sr.querySelector('[data-theme-option="forest"]')).toHaveAttribute('aria-checked', 'true')
    expect(sr.querySelector('[data-mode-option="dark"]')).toHaveAttribute('aria-checked', 'true')
  })

  it('selecting applies instantly and keeps the panel open; Escape closes', async () => {
    const themeState = await fakeThemeState()
    const { root, waitForChanges } = await render(<oyl-theme-picker themeState={themeState} />)
    const sr = root.shadowRoot!
    click(sr.querySelector('button[data-picker-trigger]')!)
    await waitForChanges()
    click(sr.querySelector('[data-theme-option="ink"]')!)
    await flush(); await waitForChanges()
    expect(themeState.settings.get().theme).toBe('ink')
    expect(sr.querySelector('[data-theme-option="ink"]')).toHaveAttribute('aria-checked', 'true')
    expect((sr.querySelector('[data-picker-panel]') as HTMLElement).hidden).toBe(false)
    click(sr.querySelector('[data-mode-option="light"]')!)
    await flush(); await waitForChanges()
    expect(themeState.settings.get().mode).toBe('light')
    sr.querySelector('[data-theme-option="ink"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }))
    await waitForChanges()
    expect((sr.querySelector('[data-picker-panel]') as HTMLElement).hidden).toBe(true)
  })

  it('arrow keys move the radio selection', async () => {
    const themeState = await fakeThemeState({ theme: 'classic', mode: 'system' })
    const { root, waitForChanges } = await render(<oyl-theme-picker themeState={themeState} />)
    const sr = root.shadowRoot!
    click(sr.querySelector('button[data-picker-trigger]')!)
    await waitForChanges()
    sr.querySelector('.themes')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await flush(); await waitForChanges()
    expect(themeState.settings.get().theme).toBe('forest')
  })
})
