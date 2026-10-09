import { Component, Element, Event, Prop, State, Watch, h, type EventEmitter } from '@stencil/core'
import { Task, Appointment, Cadence, DayKey, type Plan, type CadenceUnit } from '@oyl/all-of-oyl'

export interface PlannerWriter {
  add(plan: Plan): Promise<unknown>
}

type PlanType = 'task' | 'appointment'
const UNITS: readonly CadenceUnit[] = ['days', 'weeks', 'months', 'years']

/**
 * The planner composer: a task (title, due, optional repeat) or an appointment (title,
 * start, optional minutes). Due/start default to the shown day (start at 09:00) and
 * re-sync on day change and after a submit. Native <form> over form-associated
 * primitives; domain-constructor errors render inline against the title.
 */
@Component({ tag: 'oyl-plan-composer', styleUrl: 'oyl-plan-composer.css', shadow: true })
export class OylPlanComposer {
  @Element() host!: HTMLElement

  @Prop() store!: PlannerWriter
  @Prop() tz = 'UTC'
  /** The day new plans default to (the screen's shown day). */
  @Prop() day!: DayKey

  /** A plan was added through the store. */
  @Event() added!: EventEmitter<void>

  @State() type: PlanType = 'task'
  @State() repeat = false
  @State() error = ''

  @Watch('day')
  onDayChange() {
    this.syncDefaults()
  }

  private field(name: string): (HTMLElement & { value: string }) | null {
    return this.host.shadowRoot?.querySelector(`ui-field[name="${name}"]`) as (HTMLElement & { value: string }) | null
  }

  private value(name: string): string {
    return this.field(name)?.value ?? ''
  }

  private get dueDefault() { return this.day.value }
  private get startDefault() { return `${this.day.value}T09:00` }

  /** Write the day-derived defaults into whichever date fields are mounted. */
  private syncDefaults() {
    const due = this.field('due')
    if (due) due.value = this.dueDefault
    const starts = this.field('startsAt')
    if (starts) starts.value = this.startDefault
  }

  private onSubmit = (ev: Event) => {
    ev.preventDefault()
    void this.submit()
  }

  private onKeydown = (ev: KeyboardEvent) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
      ev.preventDefault()
      void this.submit()
    }
  }

  private async submit() {
    this.error = ''
    try {
      let plan: Plan
      const title = this.value('title')
      if (this.type === 'task') {
        const props: { title: string; due?: DayKey; cadence?: Cadence } = { title }
        const due = this.value('due')
        if (due) props.due = DayKey.of(due)
        if (this.repeat) {
          const unit = (this.host.shadowRoot?.querySelector('select[name="repeatUnit"]') as HTMLSelectElement).value as CadenceUnit
          props.cadence = Cadence.of(Number(this.value('repeatN')), unit)
        }
        plan = new Task(props)
      } else {
        const props: { title: string; startsAt: Date; durationMinutes?: number; tz: string } = { title, startsAt: new Date(this.value('startsAt')), tz: this.tz }
        const duration = this.value('duration')
        if (duration) props.durationMinutes = Number(duration)
        plan = new Appointment(props)
      }
      await this.store.add(plan)
      this.reset()
      this.added.emit()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    }
  }

  private reset() {
    for (const name of ['title', 'duration']) { const f = this.field(name); if (f) f.value = '' }
    const n = this.field('repeatN')
    if (n) n.value = '1'
    const unit = this.host.shadowRoot?.querySelector('select[name="repeatUnit"]') as HTMLSelectElement | null
    if (unit) unit.value = UNITS[0]
    this.repeat = false
    this.syncDefaults()
  }

  render() {
    const task = this.type === 'task'
    return (
      <ui-card>
        <form onSubmit={this.onSubmit} onKeyDown={this.onKeydown}>
          <ui-segment
            name="type"
            label="Plan type"
            options={[{ value: 'task', label: 'Task' }, { value: 'appointment', label: 'Appointment' }]}
            value={this.type}
            onUiChange={(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.type = e.detail.value as PlanType; this.error = '' }}
          />
          <ui-field name="title" label="Title" error={this.error || undefined} />
          {task ? (
            <div class="row2">
              <ui-field name="due" label="Due" type="date" value={this.dueDefault} />
              <div class="repeat">
                <ui-checkbox
                  name="repeat"
                  label="Repeat"
                  checked={this.repeat}
                  onUiChange={(e: CustomEvent<{ checked: boolean }>) => { e.stopPropagation(); this.repeat = e.detail.checked }}
                />
                <div class="cadence">
                  <span class="every">every</span>
                  <ui-field name="repeatN" label="Interval" type="number" value="1" disabled={!this.repeat} />
                  <label class="select">
                    <span>Unit</span>
                    <select name="repeatUnit" disabled={!this.repeat}>
                      {UNITS.map((u) => <option value={u}>{u}</option>)}
                    </select>
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div class="row2">
              <ui-field name="startsAt" label="Starts" type="datetime-local" value={this.startDefault} />
              <ui-field name="duration" label="Minutes (optional)" type="number" />
            </div>
          )}
          <p data-role="error" aria-live="polite">{this.error}</p>
          <div class="actions">
            <ui-button type="submit" variant="primary">Add to plan</ui-button>
          </div>
        </form>
      </ui-card>
    )
  }
}
