import { Component, Element, Event, Prop, State, h, type EventEmitter } from '@stencil/core'
import type { Entry, Id, Note, Measurement } from '@oyl/all-of-oyl'
import { formatClockTime } from '@oyl/all-of-oyl/format'
import { measurementUnit } from '../../journal/format.js'

/**
 * One journal entry: time | body | actions. Delete is a two-step inline confirm
 * (Delete → "Delete?" Yes/No) on native buttons — a confirm cluster, like the theme
 * picker's radios, so the shared e2e `inlineConfirm` helper's `[data-act]` clicks apply.
 */
@Component({ tag: 'oyl-entry-row', styleUrl: 'oyl-entry-row.css', shadow: true })
export class OylEntryRow {
  @Element() host!: HTMLElement
  @Prop() entry!: Entry

  /** The user confirmed deletion of this entry. */
  @Event() remove!: EventEmitter<Id>

  @State() confirming = false

  componentDidRender() {
    if (this.confirming) (this.host.shadowRoot?.querySelector('[data-act="confirm-no"]') as HTMLElement | null)?.focus()
  }

  render() {
    const e = this.entry
    // Discriminate on `kind` (the serialization discriminant), not instanceof: entries may
    // come from the bundle's copy of the domain classes or the test's — same shape either way.
    const note = e.kind === 'note' ? (e as Note) : null
    const measurement = e.kind === 'measurement' ? (e as Measurement) : null
    return (
      <div class="row">
        <span class="time">{formatClockTime(e.occurredAt)}</span>
        <div class="body">
          {note ? (
            [
              <div class="kind">Note</div>,
              <div class="text">{note.text}</div>,
              note.tags.length > 0 && <div class="tags">{note.tags.map((t) => <span class="chip">{t}</span>)}</div>,
            ]
          ) : measurement ? (
            [
              <div class="kind">Measurement</div>,
              <div class="text measure">{`${measurement.metric} = ${measurement.value}${measurementUnit(measurement.metric) ? ' ' + measurementUnit(measurement.metric) : ''}`}</div>,
            ]
          ) : (
            <div class="kind">Entry</div>
          )}
          {e.note && <div class="annot">{e.note}</div>}
        </div>
        <div class="actions">
          {this.confirming ? (
            <span class="confirm" role="group" aria-label="Delete?">
              <span>Delete?</span>
              <button type="button" class="yes" data-act="confirm-yes" onClick={() => { this.confirming = false; this.remove.emit(e.id) }}>Yes</button>
              <button type="button" class="no" data-act="confirm-no" onClick={() => (this.confirming = false)}>No</button>
            </span>
          ) : (
            <button type="button" class="del" data-act="delete" onClick={() => (this.confirming = true)}>Delete</button>
          )}
        </div>
      </div>
    )
  }
}
