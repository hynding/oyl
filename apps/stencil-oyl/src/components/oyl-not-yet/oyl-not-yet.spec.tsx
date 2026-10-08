import { render, h, describe, it, expect } from '@stencil/vitest'

describe('oyl-not-yet', () => {
  it('names the screen and links to classic only when a URL is given', async () => {
    const a = await render(<oyl-not-yet name="Journal" />)
    expect(a.root).toHaveTextContent('Journal')
    expect(a.root).toHaveTextContent('coming to the new OYL')
    expect(a.root.shadowRoot!.querySelector('ui-button')).toBeNull()
    const b = await render(<oyl-not-yet name="Journal" classicUrl="https://classic.example/journal" />)
    const link = b.root.shadowRoot!.querySelector('ui-button') as HTMLElement & { href?: string }
    expect(link.href).toBe('https://classic.example/journal')
  })
})
