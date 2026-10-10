import { Component, Element, Prop, State, h } from '@stencil/core'
import { DayKey, periodWindowOf, type DayRange, type Review } from '@oyl/all-of-oyl'
import { signal, effect, now, type Signal } from '@oyl/all-of-oyl/client'
import { INSIGHTS_PERIODS, TILES, activityLabel, areaStatsLabel, completionLabel, deltaLabel, reviewGoalLabel, usd, type InsightsPeriod, type TileKey } from '../../insights/format.js'

const EMPTY_TOTALS = { spending: 0, activityMinutes: 0, calories: 0 }

/**
 * The read-only review of a period: a week/month segment, four tiles with period-over-period
 * deltas, then goals, top spending, activity and the life-area rollup as plain rows. The period
 * is a bundle signal read inside the one effect (with today), which calls `review(range)` —
 * every store the review touches bumps a revision it reads, so the screen follows any change.
 */
@Component({ tag: 'oyl-insights', styleUrl: 'oyl-insights.css', shadow: true })
export class OylInsights {
  @Element() host!: HTMLElement

  /** `dataState.reviewOn`. */
  @Prop() review!: (range: DayRange) => Review
  @Prop() tz = 'UTC'

  @State() period: InsightsPeriod = 'month'
  @State() data: Review | undefined

  private periodSignal!: Signal<InsightsPeriod>
  private stop = () => {}

  componentWillLoad() {
    this.periodSignal = signal<InsightsPeriod>('month')
    this.stop = effect(() => {
      const period = this.periodSignal.get()
      const today = DayKey.from(now(), this.tz)
      this.period = period
      this.data = this.review(periodWindowOf(period, today))
    })
  }

  disconnectedCallback() {
    this.stop()
  }

  private onPeriod = (e: CustomEvent<{ value: string }>) => {
    e.stopPropagation()
    this.periodSignal.set(e.detail.value as InsightsPeriod)
  }

  private tile(key: TileKey, r: Review): { value: string; delta: string } {
    switch (key) {
      case 'spending': return { value: usd(r.totals.spending), delta: deltaLabel(r.deltas.spending, true) }
      case 'activity': return { value: String(Math.round(r.totals.activityMinutes)), delta: deltaLabel(r.deltas.activityMinutes, false) }
      case 'calories': return { value: String(Math.round(r.totals.calories)), delta: deltaLabel(r.deltas.calories, false) }
      case 'completion': return { value: completionLabel(r.completionRate), delta: '' }
    }
  }

  private section(cls: string, title: string, list: unknown[] , empty: string) {
    return (
      <section class={cls}>
        <div class="section-label">{title}</div>
        {list.length > 0 ? <ol class={cls}>{list}</ol> : <div class="empty">{empty}</div>}
      </section>
    )
  }

  render() {
    const r = this.data ?? { period: undefined as never, goals: [], topSpending: [], activityTotals: [], totals: EMPTY_TOTALS, previousTotals: EMPTY_TOTALS, deltas: EMPTY_TOTALS, areas: [] }
    const areas = r.areas.filter((a) => a.areaId !== undefined || a.goalsTotal > 0 || a.activityMinutes > 0 || a.projectsTouched > 0)
    return (
      <div class="screen">
        <h2 tabindex="-1">Insights</h2>
        <ui-segment name="period" label="Period" options={[...INSIGHTS_PERIODS]} value={this.period} onUiChange={this.onPeriod} />
        <div class="totals" data-role="totals" role="group" aria-label="Period totals">
          {TILES.map((t) => {
            const { value, delta } = this.tile(t.key, r)
            return (
              <div class="tile" data-tile={t.key} key={t.key}>
                <b>{value}</b>
                <small>{t.caption}</small>
                <span class="delta">{delta}</span>
              </div>
            )
          })}
        </div>
        {this.section('goals', 'Goals', r.goals.map((g) => (
          <li key={g.goalId}>
            <span class="k">{g.name ?? 'Goal'}</span>
            <span class="v">{reviewGoalLabel(g.progress)}{g.streak > 0 ? ` · 🔥 ${g.streak}` : ''}</span>
          </li>
        )), 'No goals yet')}
        {this.section('spending', 'Top spending', r.topSpending.map((s) => (
          <li key={s.category}>
            <span class="k">{s.category}</span>
            <span class="v mono">{usd(s.total)}</span>
          </li>
        )), 'Nothing this period')}
        {this.section('activity', 'Activity', r.activityTotals.map((a) => (
          <li key={a.slug}>
            <span class="k">{a.slug}</span>
            <span class="v">{activityLabel(a)}</span>
          </li>
        )), 'Nothing this period')}
        {this.section('areas', 'Life areas', areas.map((a) => (
          <li key={a.areaId ?? 'unassigned'} class="area">
            <div class="head">
              <span class="k">{a.areaId === undefined ? 'Unassigned' : a.name}</span>
              <span class="v">{areaStatsLabel(a)}</span>
            </div>
            {a.goalsTotal > 0 ? (
              <div class="bar">
                <div class="fill" style={{ 'inline-size': `${Math.round((a.goalsMet / a.goalsTotal) * 100)}%` }} />
              </div>
            ) : null}
          </li>
        )), 'No areas tracked')}
      </div>
    )
  }
}
