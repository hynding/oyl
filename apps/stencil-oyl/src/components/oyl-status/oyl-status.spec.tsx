import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { core } from '../../../vitest-setup.js'

const diagnostics = { schema: { status: 'fresh', version: 3 }, counts: { notes: 1, goals: 0 }, theme: { theme: 'classic', mode: 'system' }, build: 'abc', storage: null }
const connection = (mode: 'remote' | 'local') => ({ mode, apiBaseUrl: 'http://x/api', defaultApiBaseUrl: 'http://d/api', onApply: vi.fn() })
const actions = () => ({ onSeed: vi.fn(), onExport: vi.fn(), onImport: vi.fn(), onReset: vi.fn() })
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))

describe('oyl-status', () => {
  it('leads with the Status heading and lists diagnostics as dt/dd pairs', async () => {
    const { signal } = await core()
    const { root } = await render(<oyl-status diagnostics={() => diagnostics} pending={signal(2)} connection={connection('remote')} actions={actions()} />)
    const sr = root.shadowRoot!
    expect(sr.querySelector('h2')).toHaveTextContent('Status')
    const pairs = [...sr.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent])
    expect(pairs).toEqual(expect.arrayContaining([['schema', 'fresh v3'], ['theme', 'classic / system'], ['build', 'abc'], ['pending', '2'], ['notes', '1'], ['goals', '0']]))
  })

  it('remote mode enables the account tools and gates reset, with the explanation', async () => {
    const { signal } = await core()
    const acts = actions()
    const { root } = await render(<oyl-status diagnostics={() => diagnostics} pending={signal(0)} connection={connection('remote')} actions={acts} />)
    const sr = root.shadowRoot!
    const btn = (act: string) => sr.querySelector(`ui-button[data-act="${act}"]`) as HTMLElement & { disabled: boolean }
    for (const act of ['seed', 'export', 'import']) expect(btn(act).disabled, act).toBe(false)
    expect(btn('reset').disabled).toBe(true)
    expect(root).toHaveTextContent('Reset applies to local data — available in Local mode.')
    click(btn('seed'))
    expect(acts.onSeed).toHaveBeenCalledTimes(1)
  })

  it('local mode enables reset and gates the account tools', async () => {
    const { signal } = await core()
    const { root } = await render(<oyl-status diagnostics={() => diagnostics} pending={signal(0)} connection={connection('local')} actions={actions()} />)
    const sr = root.shadowRoot!
    const btn = (act: string) => sr.querySelector(`ui-button[data-act="${act}"]`) as HTMLElement & { disabled: boolean }
    for (const act of ['seed', 'export', 'import']) expect(btn(act).disabled, act).toBe(true)
    expect(btn('reset').disabled).toBe(false)
    expect(root).toHaveTextContent('available in Remote mode')
  })

  it('applies connection changes', async () => {
    const { signal } = await core()
    const conn = connection('remote')
    const { root } = await render(<oyl-status diagnostics={() => diagnostics} pending={signal(0)} connection={conn} actions={actions()} />)
    const sr = root.shadowRoot!
    const url = sr.querySelector('ui-field[name="apiBaseUrl"]') as HTMLElement & { value: string }
    expect(url.value).toBe('http://x/api')
    url.value = 'http://new/api'
    const select = sr.querySelector('select[name="mode"]') as HTMLSelectElement
    select.value = 'local'
    click(sr.querySelector('ui-button[data-act="apply"]')!)
    expect(conn.onApply).toHaveBeenCalledWith('local', 'http://new/api')
  })
})
