import { Component, Element, Prop, State, h } from '@stencil/core'
import { DayKey, type Entry, type Id } from '@oyl/all-of-oyl'
import { signal, effect, now, type Signal } from '@oyl/all-of-oyl/client'
import { formatDayHeading } from '@oyl/all-of-oyl/format'
import { isEditableTarget } from '../../lib/keys.js'
import type { JournalWriter } from '../oyl-log-form/oyl-log-form.js'

export interface JournalReader extends JournalWriter {
  entriesOn(day: DayKey): readonly Entry[]
  remove(id: Id): Promise<unknown>
}

const HIDDEN_KINDS = new Set(['transaction', 'consumption'])
const visible = (e: Entry) => !HIDDEN_KINDS.has(e.kind)

/**
 * The day-scoped journal: `oyl-day-nav`, the composer, and the day's notes and
 * measurements newest first (finance and nutrition rows belong to their own screens).
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
        .filter(visible)
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

  private onRemove = (e: CustomEvent<Id>) => {
    e.stopPropagation()
    void this.store.remove(e.detail)
    this.announcement = 'Entry deleted'
  }

  private marked = (d: DayKey) => this.store.entriesOn(d).some(visible)

  render() {
    const day = this.day
    const today = DayKey.from(now(), this.tz)
    const heading = formatDayHeading(day)
    return (
      <div class="screen">
        <oyl-day-nav day={day} today={today} marked={this.marked} announcement={this.announcement} onDayChange={this.onDayChange} />
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
