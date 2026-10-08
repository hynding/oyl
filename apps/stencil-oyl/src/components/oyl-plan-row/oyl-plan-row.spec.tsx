import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { Task, Appointment, Cadence, DayKey } from '@oyl/all-of-oyl'
import { appointmentTime } from '@oyl/all-of-oyl/format'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const qa = (root: HTMLElement, sel: string) => [...root.shadowRoot!.querySelectorAll(sel)]
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
const day = DayKey.of('2026-10-08')
const listen = (root: HTMLElement, name: string) => { const fn = vi.fn(); root.addEventListener(name, (e) => fn((e as CustomEvent).detail)); return fn }

describe('oyl-plan-row', () => {
  it('renders an open task with an unchecked check, Cancel and Delete', async () => {
    const plan = new Task({ title: 'Water the plants', due: day })
    const { root } = await render(<oyl-plan-row plan={plan} />)
    expect(q(root, '.title')).toHaveTextContent('Water the plants')
    const check = q(root, 'button.check')!
    expect(check).toHaveAttribute('role', 'checkbox')
    expect(check).toHaveAttribute('aria-checked', 'false')
    expect(check).toHaveAttribute('aria-label', 'Complete')
    expect((check as HTMLButtonElement).disabled).toBe(false)
    expect(qa(root, '[data-act]').map((b) => b.getAttribute('data-act'))).toEqual(['cancelplan', 'delete'])
    expect(q(root, '.badge')).toBeNull()
  })

  it('the check emits complete with the id', async () => {
    const plan = new Task({ title: 'Do it', due: day })
    const { root } = await render(<oyl-plan-row plan={plan} />)
    const complete = listen(root, 'complete')
    click(q(root, 'button.check')!)
    expect(complete).toHaveBeenCalledWith(plan.id)
  })

  it('a done task is checked, disabled, struck through and only deletable', async () => {
    const plan = new Task({ title: 'Done deal', due: day })
    plan.complete(day)
    const { root } = await render(<oyl-plan-row plan={plan} />)
    const check = q(root, 'button.check')!
    expect(check).toHaveAttribute('aria-checked', 'true')
    expect(check).toHaveAttribute('aria-label', 'Completed')
    expect((check as HTMLButtonElement).disabled).toBe(true)
    expect(q(root, '.row')).toHaveClass('done')
    expect(qa(root, '[data-act]').map((b) => b.getAttribute('data-act'))).toEqual(['delete'])
  })

  it('a canceled plan shows the Canceled badge and only Delete', async () => {
    const plan = new Task({ title: 'Nope', due: day })
    plan.cancel()
    const { root } = await render(<oyl-plan-row plan={plan} />)
    expect(q(root, '.badge.cancel')).toHaveTextContent('Canceled')
    expect(q(root, '.row')).toHaveClass('canceled')
    expect(qa(root, '[data-act]').map((b) => b.getAttribute('data-act'))).toEqual(['delete'])
  })

  it('an appointment shows its time and the Appointment badge', async () => {
    const plan = new Appointment({ title: 'Dentist', startsAt: new Date('2026-10-08T14:30:00'), durationMinutes: 45, tz: 'UTC' })
    const { root } = await render(<oyl-plan-row plan={plan} />)
    expect(q(root, '.time')).toHaveTextContent(appointmentTime(plan))
    expect(q(root, '.time')).toHaveTextContent('45m')
    expect(q(root, '.badge.appt')).toHaveTextContent('Appointment')
  })

  it('a recurring task shows its cadence', async () => {
    const plan = new Task({ title: 'Weekly review', due: day, cadence: Cadence.of(1, 'weeks') })
    const { root } = await render(<oyl-plan-row plan={plan} />)
    expect(q(root, '.badge.recur')).toHaveTextContent('↻ every week')
  })

  it('shows the overdue badge when overdueAsOf is set', async () => {
    const plan = new Task({ title: 'Late', due: DayKey.of('2026-10-05') })
    const { root } = await render(<oyl-plan-row plan={plan} overdueAsOf={day} />)
    expect(q(root, '.badge.overdue')).toHaveTextContent('Due Oct 5 · 3d ago')
  })

  it('cancel asks inline; No restores, Yes emits cancelPlan', async () => {
    const plan = new Task({ title: 'Cancel me', due: day })
    const { root, waitForChanges } = await render(<oyl-plan-row plan={plan} />)
    const canceled = listen(root, 'cancelPlan')
    click(q(root, '[data-act="cancelplan"]')!)
    await waitForChanges()
    const group = q(root, '[role="group"]')!
    expect(group).toHaveAttribute('aria-label', 'Cancel plan?')
    expect(root.shadowRoot!.activeElement).toBe(q(root, '[data-act="confirm-no"]'))
    click(q(root, '[data-act="confirm-no"]')!)
    await waitForChanges()
    expect(q(root, '[role="group"]')).toBeNull()
    expect(qa(root, '[data-act]').map((b) => b.getAttribute('data-act'))).toEqual(['cancelplan', 'delete'])
    expect(canceled).not.toHaveBeenCalled()
    click(q(root, '[data-act="cancelplan"]')!)
    await waitForChanges()
    click(q(root, '[data-act="confirm-yes"]')!)
    expect(canceled).toHaveBeenCalledWith(plan.id)
  })

  it('delete asks inline; Yes emits remove', async () => {
    const plan = new Task({ title: 'Doomed', due: day })
    const { root, waitForChanges } = await render(<oyl-plan-row plan={plan} />)
    const removed = listen(root, 'remove')
    click(q(root, '[data-act="delete"]')!)
    await waitForChanges()
    expect(q(root, '[role="group"]')).toHaveAttribute('aria-label', 'Delete?')
    click(q(root, '[data-act="confirm-yes"]')!)
    expect(removed).toHaveBeenCalledWith(plan.id)
  })
})
