import { Component, Element, Event, Prop, State, h, type EventEmitter } from '@stencil/core'
import { Goal, type GoalPeriod } from '@oyl/all-of-oyl'
import { PERIOD_OPTIONS, PRESETS, PRESET_OPTIONS, metricUnit } from '../../goals/format.js'

export interface GoalsWriter {
  add(g: Goal): Promise<unknown>
}

/**
 * Add a goal from a metric preset: the preset fixes metric/direction/aggregation and proposes
 * a period and a unit hint; the user supplies the target, an optional name and may override
 * the period. The form owns `presetIndex` and `period` (the `ui-select` rule), and re-derives
 * the period from each newly chosen preset.
 */
@Component({ tag: 'oyl-goal-form', styleUrl: 'oyl-goal-form.css', shadow: true })
export class OylGoalForm {
  @Element() host!: HTMLElement

  @Prop() store!: GoalsWriter

  /** A goal was added through the store. */
  @Event() added!: EventEmitter<void>

  @State() presetIndex = 0
  @State() period: GoalPeriod = PRESETS[0]!.period
  @State() error = ''

  private field(name: string): (HTMLElement & { value: string }) | null {
    return this.host.shadowRoot?.querySelector(`ui-field[name="${name}"]`) as (HTMLElement & { value: string }) | null
  }

  private onPreset = (e: CustomEvent<{ value: string }>) => {
    e.stopPropagation()
    const i = Number(e.detail.value)
    const preset = PRESETS[i]
    if (!preset) return
    this.presetIndex = i
    this.period = preset.period
  }

  private onPeriod = (e: CustomEvent<{ value: string }>) => {
    e.stopPropagation()
    this.period = e.detail.value as GoalPeriod
  }

  private onSubmit = (ev: Event) => {
    ev.preventDefault()
    void this.submit()
  }

  private async submit() {
    this.error = ''
    try {
      const preset = PRESETS[this.presetIndex]!
      const name = this.field('name')?.value ?? ''
      const goal = new Goal({
        metric: preset.metric,
        target: Number(this.field('target')?.value ?? ''),
        direction: preset.direction,
        aggregation: preset.aggregation,
        period: this.period,
        ...(name ? { name } : {}),
      })
      await this.store.add(goal)
      for (const f of ['name', 'target']) {
        const el = this.field(f)
        if (el) el.value = ''
      }
      this.added.emit()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    }
  }

  render() {
    const preset = PRESETS[this.presetIndex]!
    return (
      <form onSubmit={this.onSubmit}>
        <ui-select name="preset" label="Metric" options={PRESET_OPTIONS} value={String(this.presetIndex)} onUiChange={this.onPreset} />
        <ui-field name="name" label="Name (optional)" type="text" />
        <div class="row2">
          <ui-field name="target" label="Target" type="number" hint={metricUnit(preset.metric) || undefined} error={this.error || undefined} />
          <ui-select name="period" label="Period" options={PERIOD_OPTIONS} value={this.period} onUiChange={this.onPeriod} />
        </div>
        <p data-role="error" aria-live="polite">{this.error}</p>
        <div class="actions">
          <ui-button type="submit" variant="primary">Add goal</ui-button>
        </div>
      </form>
    )
  }
}
