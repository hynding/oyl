import { Component, Element, Event, Prop, State, Watch, h, type EventEmitter } from '@stencil/core'
import { Note, Measurement, type DayKey, type Entry } from '@oyl/all-of-oyl'
import { METRICS, TAG_RE, parseTags } from '../../journal/format.js'

export interface JournalWriter {
  add(entry: Entry): Promise<unknown>
}

type EntryType = 'note' | 'measurement'

/**
 * The journal composer: a note (text + tags) or a measurement (metric + value), with a
 * `when` prefilled to the shown day at the current time. Submits through a native <form>
 * on form-associated primitives; domain-constructor errors render inline.
 */
@Component({ tag: 'oyl-log-form', styleUrl: 'oyl-log-form.css', shadow: true })
export class OylLogForm {
  @Element() host!: HTMLElement

  @Prop() store!: JournalWriter
  /** The day the entry defaults to (the screen's shown day). */
  @Prop() day!: DayKey

  /** An entry was added through the store. */
  @Event() logged!: EventEmitter<void>

  @State() type: EntryType = 'note'
  @State() metric: string = METRICS[0]
  @State() error = ''
  @State() fieldError: 'text' | 'value' | null = null
  @State() tags: string[] = []
  @State() when = ''

  componentWillLoad() {
    this.syncWhen()
  }

  @Watch('day')
  onDayChange() {
    this.syncWhen()
  }

  /** `${day}THH:MM` — the shown day at the current clock time (vanilla's rule). */
  private syncWhen() {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    this.when = `${this.day.value}T${hh}:${mm}`
  }

  private value(sel: string): string {
    const el = this.host.shadowRoot?.querySelector(sel) as (HTMLElement & { value: string }) | null
    return el?.value ?? ''
  }

  private onSubmit = (ev: Event) => {
    ev.preventDefault()
    void this.submit()
  }

  private async submit() {
    this.error = ''
    this.fieldError = null
    const occurredAt = new Date(this.value('ui-field[name="when"]'))
    try {
      let entry: Entry
      if (this.type === 'note') {
        entry = new Note({ occurredAt, text: this.value('ui-textarea[name="text"]'), tags: parseTags(this.value('ui-field[name="tags"]')) })
      } else {
        const metric = this.metric === 'custom' ? this.value('ui-field[name="custom"]') : this.metric
        entry = new Measurement({ occurredAt, metric, value: Number(this.value('ui-field[name="value"]')) })
      }
      await this.store.add(entry)
      this.reset()
      this.logged.emit()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
      this.fieldError = this.type === 'note' ? 'text' : 'value'
    }
  }

  private reset() {
    const sr = this.host.shadowRoot!
    for (const el of sr.querySelectorAll<HTMLElement & { value: string }>('ui-textarea, ui-field:not([name="when"])')) el.value = ''
    this.tags = []
    this.syncWhen()
  }

  render() {
    const note = this.type === 'note'
    return (
      <ui-card>
        <form onSubmit={this.onSubmit}>
          <ui-segment
            name="type"
            label="Entry type"
            options={[{ value: 'note', label: 'Note' }, { value: 'measurement', label: 'Measurement' }]}
            value={this.type}
            onUiChange={(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.type = e.detail.value as EntryType; this.error = ''; this.fieldError = null }}
          />
          {note ? (
            <div class="fields">
              <ui-textarea
                name="text"
                label="What happened?"
                placeholder="A line about your day…"
                error={this.fieldError === 'text' ? this.error : undefined}
                onUiSubmit={(e: Event) => { e.stopPropagation(); void this.submit() }}
              />
              <ui-field
                name="tags"
                label="Tags"
                hint="Optional, lowercase words"
                onUiInput={(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.tags = parseTags(e.detail.value) }}
              />
              {this.tags.length > 0 && (
                <div class="chips">
                  {this.tags.map((t) => <span class={{ chip: true, bad: !TAG_RE.test(t) }}>{t}</span>)}
                </div>
              )}
            </div>
          ) : (
            <div class="fields">
              <div class="row2">
                <label class="select">
                  <span>Metric</span>
                  <select name="metric" onChange={(e: Event) => (this.metric = (e.target as HTMLSelectElement).value)}>
                    {METRICS.map((m) => <option value={m} selected={m === this.metric}>{m === 'custom' ? 'custom.…' : m}</option>)}
                  </select>
                </label>
                <ui-field name="value" label="Value" type="number" error={this.fieldError === 'value' ? this.error : undefined} />
              </div>
              {this.metric === 'custom' && <ui-field name="custom" label="Custom metric key" hint="custom.your_metric" />}
            </div>
          )}
          <ui-field name="when" label="When" type="datetime-local" value={this.when} />
          <p data-role="error" aria-live="polite" id="log-error">{this.error}</p>
          <div class="actions">
            <ui-button type="submit" variant="primary">Log it</ui-button>
          </div>
        </form>
      </ui-card>
    )
  }
}
