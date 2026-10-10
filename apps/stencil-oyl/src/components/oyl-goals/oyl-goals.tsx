import { Component, Element, Prop, State, h } from '@stencil/core'
import { DayKey, type Goal, type GoalProgress, type Id } from '@oyl/all-of-oyl'
import { effect, now } from '@oyl/all-of-oyl/client'
import { goalProgressLabel, metricUnit, summaryLine } from '../../goals/format.js'
import type { GoalsWriter } from '../oyl-goal-form/oyl-goal-form.js'
import type { ProgressTone } from '../oyl-progress-row/oyl-progress-row.js'

export interface GoalsStore extends GoalsWriter {
  all(): readonly Goal[]
  remove(id: Id): Promise<unknown>
  pause(id: Id, on: DayKey): Promise<unknown>
  resume(id: Id, on: DayKey): Promise<unknown>
}
export interface GoalsJournal {
  progressOf(goal: Goal, day: DayKey): GoalProgress
}

/**
 * Goals: a summary line, a collapsed "New goal" form, and one `oyl-progress-row` per goal
 * tracked against the journal. One effect over the goals store and the journal revision
 * (`progressOf` reads it) mirrors fresh `goals` + `progress` arrays into state; row props
 * derive in `render()`. The Pause/Resume action follows the goal's open pause, not
 * `progress.paused`: a same-day resume closes the range inclusively, so the period stays
 * paused through today while there is nothing left to resume.
 */
@Component({ tag: 'oyl-goals', styleUrl: 'oyl-goals.css', shadow: true })
export class OylGoals {
  @Element() host!: HTMLElement

  @Prop() store!: GoalsStore
  @Prop() journal!: GoalsJournal
  @Prop() tz = 'UTC'

  @State() goals: readonly Goal[] = []
  @State() progress: readonly GoalProgress[] = []
  @State() announcement = ''

  private stop = () => {}

  componentWillLoad() {
    this.stop = effect(() => {
      const today = this.today()
      const goals = this.store.all()
      this.goals = goals
      this.progress = goals.map((g) => this.journal.progressOf(g, today))
    })
  }

  disconnectedCallback() {
    this.stop()
  }

  private today() {
    return DayKey.from(now(), this.tz)
  }

  private announce(msg: string) {
    this.announcement = msg
  }

  private onAct = (e: CustomEvent<{ act: string; itemId: string }>) => {
    e.stopPropagation()
    void this.toggle(e.detail.itemId as Id, e.detail.act === 'resume')
  }

  private async toggle(id: Id, resume: boolean) {
    try {
      if (resume) {
        await this.store.resume(id, this.today())
        this.announce('Resumed')
      } else {
        await this.store.pause(id, this.today())
        this.announce('Paused')
      }
    } catch (err) {
      this.announce(err instanceof Error ? err.message : String(err))
    }
  }

  private onRemove = (e: CustomEvent<string>) => {
    e.stopPropagation()
    void this.store.remove(e.detail as Id)
    this.announce('Deleted')
  }

  private onAdded = (e: Event) => {
    e.stopPropagation()
    this.announce('Goal added')
  }

  render() {
    const summary = summaryLine(this.progress)
    return (
      <div class="screen">
        <h2 tabindex="-1">Goals</h2>
        <div class="sr-only" aria-live="polite">{this.announcement}</div>
        {summary && <div class="summary" data-role="summary">{summary}</div>}
        <details>
          <summary>New goal</summary>
          <oyl-goal-form store={this.store} onAdded={this.onAdded} />
        </details>
        {this.goals.length > 0 ? (
          <ol class="goals">
            {this.goals.map((g, i) => {
              const p = this.progress[i]!
              const met = p.met === true
              const tone: ProgressTone | undefined = p.paused || p.empty ? 'muted' : met ? 'met' : undefined
              const open = g.pauses.some((r) => r.to === undefined)
              return (
                <li key={g.id}>
                  <oyl-progress-row
                    itemId={g.id}
                    name={g.name ?? String(g.metric)}
                    met={met}
                    ratio={p.ratio}
                    tone={tone}
                    label={goalProgressLabel(p, g.direction, metricUnit(String(g.metric)))}
                    action={open ? { act: 'resume', label: 'Resume' } : { act: 'pause', label: 'Pause' }}
                    onAct={this.onAct}
                    onRemove={this.onRemove}
                  />
                </li>
              )
            })}
          </ol>
        ) : (
          <div class="empty">No goals yet.</div>
        )}
      </div>
    )
  }
}
