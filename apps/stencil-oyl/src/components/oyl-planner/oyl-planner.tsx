import { Component, Element, Prop, State, h } from '@stencil/core'
import { DayKey, type Plan, type Id } from '@oyl/all-of-oyl'
import { signal, effect, now, type Signal } from '@oyl/all-of-oyl/client'
import { formatDayHeading } from '@oyl/all-of-oyl/format'
import { isEditableTarget } from '../../lib/keys.js'
import type { PlannerWriter } from '../oyl-plan-composer/oyl-plan-composer.js'

export interface PlannerReader extends PlannerWriter {
  overdue(day: DayKey): readonly Plan[]
  agendaFor(day: DayKey): readonly Plan[]
  canceledOn(day: DayKey): readonly Plan[]
  complete(id: Id, on: DayKey): Promise<unknown>
  cancel(id: Id): Promise<unknown>
  remove(id: Id): Promise<unknown>
}

/**
 * The day-scoped planner: `oyl-day-nav`, the composer, an Overdue section (today only)
 * and the day's agenda (appointments by time, tasks, then canceled plans) — the same
 * lists and callbacks as vanilla's planner. ArrowLeft/Right move a day when focus is
 * not in a field or radio.
 */
@Component({ tag: 'oyl-planner', styleUrl: 'oyl-planner.css', shadow: true })
export class OylPlanner {
  @Element() host!: HTMLElement

  @Prop() store!: PlannerReader
  @Prop() tz = 'UTC'

  @State() day!: DayKey
  @State() overdue: readonly Plan[] = []
  @State() agenda: readonly Plan[] = []
  @State() announcement = ''

  private daySignal!: Signal<DayKey>
  private stop = () => {}

  componentWillLoad() {
    this.daySignal = signal(DayKey.from(now(), this.tz), (a, b) => a.equals(b))
    // One effect: tracks the day AND the store's revision (its reads auto-track it).
    this.stop = effect(() => {
      const day = this.daySignal.get()
      const today = this.today()
      this.day = day
      this.overdue = day.equals(today) ? [...this.store.overdue(today)] : []
      this.agenda = [...this.store.agendaFor(day), ...this.store.canceledOn(day)]
    })
  }

  connectedCallback() {
    this.host.addEventListener('keydown', this.onKeydown)
  }

  disconnectedCallback() {
    this.host.removeEventListener('keydown', this.onKeydown)
    this.stop()
  }

  private today() {
    return DayKey.from(now(), this.tz)
  }

  private onKeydown = (e: KeyboardEvent) => {
    if (isEditableTarget(e)) return
    if (e.key === 'ArrowLeft') this.go(-1)
    else if (e.key === 'ArrowRight') this.go(1)
  }

  private go(delta: number) {
    this.setDay(this.daySignal.get().addDays(delta))
    void (this.host.shadowRoot?.querySelector('oyl-day-nav') as HTMLOylDayNavElement | null)?.focusHeading()
  }

  private setDay(day: DayKey) {
    this.daySignal.set(day)
    this.announcement = `Showing ${formatDayHeading(day)}`
  }

  private onDayChange = (e: CustomEvent<DayKey>) => {
    e.stopPropagation()
    this.setDay(e.detail)
  }

  private onComplete = (e: CustomEvent<Id>) => {
    e.stopPropagation()
    void this.store.complete(e.detail, this.today())
    this.announcement = 'Completed'
  }

  private onCancelPlan = (e: CustomEvent<Id>) => {
    e.stopPropagation()
    void this.store.cancel(e.detail)
    this.announcement = 'Canceled'
  }

  private onRemove = (e: CustomEvent<Id>) => {
    e.stopPropagation()
    void this.store.remove(e.detail)
    this.announcement = 'Deleted'
  }

  private onAdded = (e: Event) => {
    e.stopPropagation()
    this.announcement = 'Added to plan'
  }

  private marked = (d: DayKey) => this.store.agendaFor(d).some((p) => p.status === 'open')

  private rows(plans: readonly Plan[], overdueAsOf?: DayKey) {
    return plans.map((plan) => (
      <li key={plan.id}>
        <oyl-plan-row plan={plan} overdueAsOf={overdueAsOf} onCompletePlan={this.onComplete} onCancelPlan={this.onCancelPlan} onRemove={this.onRemove} />
      </li>
    ))
  }

  render() {
    const day = this.day
    const today = this.today()
    const heading = formatDayHeading(day)
    const empty = this.overdue.length === 0 && this.agenda.length === 0
    return (
      <div class="screen">
        <oyl-day-nav day={day} today={today} marked={this.marked} announcement={this.announcement} onDayChange={this.onDayChange} />
        <oyl-plan-composer store={this.store} tz={this.tz} day={day} onAdded={this.onAdded} />
        {this.overdue.length > 0 && [
          <div class="section-label overdue">Overdue</div>,
          <ol class="overdue-list">{this.rows(this.overdue, today)}</ol>,
        ]}
        {this.agenda.length > 0 && [
          <div class="section-label">{heading}</div>,
          <ol class="agenda-list">{this.rows(this.agenda)}</ol>,
        ]}
        {empty && <div class="empty">Nothing planned for {heading}. Add a task or appointment above.</div>}
      </div>
    )
  }
}
