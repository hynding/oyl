import { Component, Element, Event, Prop, State, h, type EventEmitter } from '@stencil/core'
import type { Plan, Task, Appointment, Id, DayKey } from '@oyl/all-of-oyl'
import { cadenceLabel, appointmentTime } from '@oyl/all-of-oyl/format'
import { overdueBadge } from '../../planner/format.js'

type Confirming = 'cancelplan' | 'delete' | null

/**
 * One plan: check | body | actions. The round check completes an open plan; Cancel and
 * Delete are two-step inline confirms on native buttons (a control cluster, like the
 * entry row's), so the shared e2e `inlineConfirm` helper's `[data-act]` clicks apply.
 */
@Component({ tag: 'oyl-plan-row', styleUrl: 'oyl-plan-row.css', shadow: true })
export class OylPlanRow {
  @Element() host!: HTMLElement

  @Prop() plan!: Plan
  /** Set by the Overdue section: shows "Due … · Nd ago" relative to this day. */
  @Prop() overdueAsOf?: DayKey

  @Event() completePlan!: EventEmitter<Id>
  @Event() cancelPlan!: EventEmitter<Id>
  @Event() remove!: EventEmitter<Id>

  @State() confirming: Confirming = null

  componentDidRender() {
    if (this.confirming) (this.host.shadowRoot?.querySelector('[data-act="confirm-no"]') as HTMLElement | null)?.focus()
  }

  private onCheck = () => {
    if (this.plan.status === 'open') this.completePlan.emit(this.plan.id)
  }

  private confirmYes = () => {
    const act = this.confirming
    this.confirming = null
    if (act === 'delete') this.remove.emit(this.plan.id)
    else if (act === 'cancelplan') this.cancelPlan.emit(this.plan.id)
  }

  render() {
    const p = this.plan
    const status = p.status
    const open = status === 'open'
    // Discriminate on `kind` (the serialization discriminant), not instanceof: plans may
    // come from the bundle's copy of the domain classes or the test's.
    const appt = p.kind === 'appointment' ? (p as Appointment) : null
    const task = p.kind === 'task' ? (p as Task) : null
    return (
      <div class={{ row: true, [status]: true }}>
        <button
          type="button"
          class={{ check: true, done: status === 'done' }}
          role="checkbox"
          aria-checked={String(status === 'done')}
          aria-label={status === 'done' ? 'Completed' : 'Complete'}
          disabled={!open}
          onClick={this.onCheck}
        />
        <div class="body">
          <div class="title">{p.title}</div>
          <div class="meta">
            {this.overdueAsOf !== undefined && p.due !== undefined && <span class="badge overdue">{overdueBadge(p.due, this.overdueAsOf)}</span>}
            {appt && [<span class="time">{appointmentTime(appt)}</span>, <span class="badge appt">Appointment</span>]}
            {task?.cadence !== undefined && <span class="badge recur">↻ {cadenceLabel(task.cadence)}</span>}
            {status === 'canceled' && <span class="badge cancel">Canceled</span>}
          </div>
        </div>
        <div class="actions">
          {this.confirming ? (
            <span class="confirm" role="group" aria-label={this.confirming === 'delete' ? 'Delete?' : 'Cancel plan?'}>
              <span>{this.confirming === 'delete' ? 'Delete?' : 'Cancel plan?'}</span>
              <button type="button" class="yes" data-act="confirm-yes" onClick={this.confirmYes}>Yes</button>
              <button type="button" class="no" data-act="confirm-no" onClick={() => (this.confirming = null)}>No</button>
            </span>
          ) : (
            [
              open && <button type="button" class="quiet" data-act="cancelplan" onClick={() => (this.confirming = 'cancelplan')}>Cancel</button>,
              <button type="button" class="del" data-act="delete" onClick={() => (this.confirming = 'delete')}>Delete</button>,
            ]
          )}
        </div>
      </div>
    )
  }
}
