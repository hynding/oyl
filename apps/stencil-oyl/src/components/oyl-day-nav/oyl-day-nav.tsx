import { Component, Element, Event, Method, Prop, h, type EventEmitter } from '@stencil/core'
import type { DayKey } from '@oyl/all-of-oyl'
import { formatDayHeading, relativeDayLabel } from '@oyl/all-of-oyl/format'

/**
 * Day navigation shared by the day-scoped screens (Journal, Planner, …): prev/next around
 * a focusable heading, a 7-day pill strip centred on the shown day, and a polite live
 * region for the screen's announcements. Controlled: the screen owns the day signal and
 * passes `day`/`today`; this emits `dayChange` and focuses the heading after a change it
 * initiated. `marked(day)` puts a dot under a pill — the screen decides what counts.
 */
@Component({ tag: 'oyl-day-nav', styleUrl: 'oyl-day-nav.css', shadow: true })
export class OylDayNav {
  @Element() host!: HTMLElement

  @Prop() day!: DayKey
  @Prop() today!: DayKey
  @Prop() marked?: (day: DayKey) => boolean
  /** Text for the polite live region (screen announcements: "Entry added", "Showing …"). */
  @Prop() announcement = ''

  /** The user picked a day (prev/next or a pill). */
  @Event() dayChange!: EventEmitter<DayKey>

  /** Move keyboard focus to the heading (the screens call it after an arrow-key move). */
  @Method()
  async focusHeading() {
    ;(this.host.shadowRoot?.querySelector('h2') as HTMLElement | null)?.focus()
  }

  private pick(day: DayKey) {
    this.dayChange.emit(day)
    void this.focusHeading()
  }

  // Stable handlers that read `day` at click time: a foreign custom element (`ui-button`)
  // keeps the listener from its first render, so a closure over the render's `day` goes stale.
  private onPrev = () => this.pick(this.day.addDays(-1))
  private onNext = () => this.pick(this.day.addDays(1))

  render() {
    const day = this.day
    const week = [-3, -2, -1, 0, 1, 2, 3].map((d) => day.addDays(d))
    return (
      <div class="nav">
        <header class="daynav">
          <ui-button variant="ghost" data-nav="prev" aria-label="Previous day" onClick={this.onPrev}>
            <ui-icon name="chevron-left" />
          </ui-button>
          <div class="day">
            <h2 tabindex="-1">{formatDayHeading(day)}</h2>
            <div class="rel">{relativeDayLabel(day, this.today)}</div>
          </div>
          <ui-button variant="ghost" data-nav="next" aria-label="Next day" onClick={this.onNext}>
            <ui-icon name="chevron-right" />
          </ui-button>
        </header>
        <div class="week" role="group" aria-label="Week">
          {week.map((d) => (
            <button type="button" data-day={d.value} aria-pressed={String(d.equals(day))} onClick={() => this.pick(d)}>
              <span class="wd">{weekdayShort(d)}</span>
              <span class="dm">{Number(d.value.slice(8))}</span>
              {this.marked?.(d) ? <i class="dot" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
        <div class="sr-only" aria-live="polite">{this.announcement}</div>
      </div>
    )
  }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function weekdayShort(d: DayKey): string {
  return WEEKDAYS[new Date(`${d.value}T12:00:00Z`).getUTCDay()]!
}
