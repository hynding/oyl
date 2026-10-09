import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { DayKey } from '@oyl/all-of-oyl'
import { formatDayHeading } from '@oyl/all-of-oyl/format'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const qa = (root: HTMLElement, sel: string) => [...root.shadowRoot!.querySelectorAll(sel)]
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
const inner = (el: Element) => el.shadowRoot?.querySelector('button') ?? el
const today = DayKey.of('2026-10-08')

describe('oyl-day-nav', () => {
  it('renders the heading, the relative label and a 7-day strip around the day', async () => {
    const { root } = await render(<oyl-day-nav day={today} today={today} />)
    expect(q(root, 'h2')).toHaveTextContent(formatDayHeading(today))
    expect(q(root, '.rel')).toHaveTextContent('Today')
    const pills = qa(root, '[data-day]')
    expect(pills.map((p) => p.getAttribute('data-day'))).toEqual(
      [-3, -2, -1, 0, 1, 2, 3].map((d) => today.addDays(d).value),
    )
    expect(pills[3]).toHaveAttribute('aria-pressed', 'true')
    expect(pills.filter((p) => p.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
    expect(q(root, '[role="group"][aria-label="Week"]')).not.toBeNull()
  })

  it('prev/next emit dayChange with the adjacent day and focus the heading', async () => {
    const { root } = await render(<oyl-day-nav day={today} today={today} />)
    const handler = vi.fn()
    root.addEventListener('dayChange', (e) => handler((e as CustomEvent<DayKey>).detail.value))
    click(inner(q(root, 'ui-button[data-nav="prev"]')!))
    expect(handler).toHaveBeenLastCalledWith('2026-10-07')
    click(inner(q(root, 'ui-button[data-nav="next"]')!))
    expect(handler).toHaveBeenLastCalledWith('2026-10-09')
    expect(root.shadowRoot!.activeElement).toBe(q(root, 'h2'))
  })

  it('a pill click emits that day', async () => {
    const { root } = await render(<oyl-day-nav day={today} today={today} />)
    const handler = vi.fn()
    root.addEventListener('dayChange', (e) => handler((e as CustomEvent<DayKey>).detail.value))
    click(q(root, '[data-day="2026-10-10"]')!)
    expect(handler).toHaveBeenCalledWith('2026-10-10')
  })

  it('shows a dot on marked days only', async () => {
    const marked = (d: DayKey) => d.value === '2026-10-06' || d.value === '2026-10-09'
    const { root } = await render(<oyl-day-nav day={today} today={today} marked={marked} />)
    const dotted = qa(root, '[data-day]').filter((p) => p.querySelector('.dot')).map((p) => p.getAttribute('data-day'))
    expect(dotted).toEqual(['2026-10-06', '2026-10-09'])
  })

  it('reflects the day prop and relative label when the host changes the day', async () => {
    const { root, waitForChanges } = await render(<oyl-day-nav day={today} today={today} />)
    ;(root as HTMLElement & { day: DayKey }).day = today.addDays(-1)
    await waitForChanges()
    expect(q(root, '.rel')).toHaveTextContent('Yesterday')
    expect(q(root, '[data-day="2026-10-07"]')).toHaveAttribute('aria-pressed', 'true')
  })

  it('writes the announcement to its live region', async () => {
    const { root, waitForChanges } = await render(<oyl-day-nav day={today} today={today} announcement="Entry added" />)
    expect(q(root, '[aria-live="polite"]')).toHaveTextContent('Entry added')
    ;(root as HTMLElement & { announcement: string }).announcement = 'Deleted'
    await waitForChanges()
    expect(q(root, '[aria-live="polite"]')).toHaveTextContent('Deleted')
  })
})
