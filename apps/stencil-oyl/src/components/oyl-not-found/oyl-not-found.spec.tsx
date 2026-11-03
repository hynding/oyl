import { render, h, describe, it, expect } from '@stencil/vitest'

describe('oyl-not-found', () => {
  it('names the missing route as text', async () => {
    const { root } = await render(<oyl-not-found route="<i>nope</i>" />)
    expect(root).toHaveTextContent('Not found')
    expect(root).toHaveTextContent('<i>nope</i>')
    expect(root.shadowRoot!.querySelector('i')).toBeNull()
  })

  it('offers the way back to the Journal (every signed-in user can open it)', async () => {
    const { root } = await render(<oyl-not-found route="nope" />)
    expect((root.shadowRoot!.querySelector('ui-button') as HTMLElement & { href?: string }).href).toBe('/journal')
  })
})
