import { Component, Element, Prop, State, h } from '@stencil/core'
import { DayKey, type Entry, type Id } from '@oyl/all-of-oyl'
import { signal, effect, now, type Signal } from '@oyl/all-of-oyl/client'
import { formatDayHeading, relativeDayLabel } from '@oyl/all-of-oyl/format'
import type { JournalWriter } from '../oyl-log-form/oyl-log-form.js'

export interface JournalReader extends JournalWriter {
  entriesOn(day: DayKey): readonly Entry[]
  remove(id: Id): Promise<unknown>
}

const HIDDEN_KINDS = new Set(['transaction', 'consumption'])

/**
 * The day-scoped journal: prev/next + a 7-day pill strip, the composer, and the day's notes
 * and measurements newest first (finance and nutrition rows belong to their own screens).
 * ArrowLeft/Right move a day when focus is not in a field or radio.
 */
@Component({ tag: 'oyl-journal', styleUrl: 'oyl-journal.css', shadow: true })
export class OylJournal {
  @Element() host!: HTMLElement

  @Prop() store!: JournalReader
  @Prop() tz = 'UTC'

  @State() day!: DayKey
  @State() entries: readonly Entry[] = []
  @State() announcement = ''

  private daySignal!: Signal<DayKey>
  private stop = () => {}

  componentWillLoad() {
    this.daySignal = signal(DayKey.from(now(), this.tz), (a, b) => a.equals(b))
    // One effect: tracks the day AND the store's revision (entriesOn auto-tracks it).
    this.stop = effect(() => {
      const day = this.daySignal.get()
      this.day = day
      this.entries = [...this.store.entriesOn(day)]
        .filter((e) => !HIDDEN_KINDS.has(e.kind))
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    })
  }

  connectedCallback() {
    this.host.addEventListener('keydown', this.onKeydown)
  }

  disconnectedCallback() {
    this.host.removeEventListener('keydown', this.onKeydown)
    this.stop()
  }

  private onKeydown = (e: KeyboardEvent) => {
    const target = e.composedPath()[0] as Element | undefined
    const tag = target?.tagName ?? ''
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.getAttribute?.('role') === 'radio') return
    if (e.key === 'ArrowLeft') this.go(-1)
    else if (e.key === 'ArrowRight') this.go(1)
  }

  private go(delta: number) {
    this.setDay(this.daySignal.get().addDays(delta))
  }

  private setDay(day: DayKey) {
    this.daySignal.set(day)
    this.announcement = `Showing ${formatDayHeading(day)}`
    ;(this.host.shadowRoot?.querySelector('h2') as HTMLElement | null)?.focus()
  }

  private onRemove = (e: CustomEvent<Id>) => {
    e.stopPropagation()
    void this.store.remove(e.detail)
    this.announcement = 'Entry deleted'
  }

  render() {
    const day = this.day
    const today = DayKey.from(now(), this.tz)
    const heading = formatDayHeading(day)
    const week = [-3, -2, -1, 0, 1, 2, 3].map((d) => day.addDays(d))
    return (
      <div class="screen">
        <header class="daynav">
          <ui-button variant="ghost" data-nav="prev" aria-label="Previous day" onClick={() => this.go(-1)}>
            <ui-icon name="chevron-left" />
          </ui-button>
          <div class="day">
            <h2 tabindex="-1">{heading}</h2>
            <div class="rel">{relativeDayLabel(day, today)}</div>
          </div>
          <ui-button variant="ghost" data-nav="next" aria-label="Next day" onClick={() => this.go(1)}>
            <ui-icon name="chevron-right" />
          </ui-button>
        </header>
        <div class="week" role="group" aria-label="Week">
          {week.map((d) => (
            <button type="button" data-day={d.value} aria-pressed={String(d.equals(day))} onClick={() => this.setDay(d)}>
              <span class="wd">{weekdayShort(d)}</span>
              <span class="dm">{Number(d.value.slice(8))}</span>
            </button>
          ))}
        </div>
        <div class="sr-only" aria-live="polite">{this.announcement}</div>
        <oyl-log-form store={this.store} day={day} onLogged={(e: Event) => { e.stopPropagation(); this.announcement = 'Entry added' }} />
        {this.entries.length > 0 ? (
          <ol>
            {this.entries.map((entry) => (
              <li key={entry.id}>
                <oyl-entry-row entry={entry} onRemove={this.onRemove} />
              </li>
            ))}
          </ol>
        ) : (
          <div class="empty">Nothing logged for {heading}. Add a note or a measurement above.</div>
        )}
      </div>
    )
  }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function weekdayShort(d: DayKey): string {
  return WEEKDAYS[new Date(`${d.value}T12:00:00Z`).getUTCDay()]!
}
