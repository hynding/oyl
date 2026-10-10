import { Component, Element, Event, Prop, State, h, type EventEmitter } from '@stencil/core'
import { DayKey, Document } from '@oyl/all-of-oyl'
import { clearFields, fieldValue } from '../../vault/format.js'

export interface DocumentsWriter {
  addDocument(d: Document): Promise<unknown>
}

/** Add a document: name, kind and an optional expiry (which feeds the Upcoming feed). */
@Component({ tag: 'oyl-document-form', styleUrl: 'oyl-document-form.css', shadow: true })
export class OylDocumentForm {
  @Element() host!: HTMLElement

  @Prop() store!: DocumentsWriter

  /** A document was added through the store. */
  @Event() added!: EventEmitter<void>

  @State() error = ''

  private onSubmit = (ev: Event) => {
    ev.preventDefault()
    void this.submit()
  }

  private async submit() {
    this.error = ''
    const sr = this.host.shadowRoot
    try {
      const expiresOn = fieldValue(sr, 'expiresOn')
      await this.store.addDocument(new Document({ name: fieldValue(sr, 'name'), kind: fieldValue(sr, 'kind'), ...(expiresOn ? { expiresOn: DayKey.of(expiresOn) } : {}) }))
      clearFields(sr)
      this.added.emit()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    }
  }

  render() {
    // The field the message names is the one marked invalid ("kind must be non-empty" → Kind).
    const kindError = /\bkind\b/.test(this.error) ? this.error : undefined
    const nameError = this.error && !kindError ? this.error : undefined
    return (
      <form onSubmit={this.onSubmit}>
        <ui-field name="name" label="Name" error={nameError} />
        <div class="row2">
          <ui-field name="kind" label="Kind" error={kindError} />
          <ui-field name="expiresOn" label="Expires (optional)" type="date" />
        </div>
        <p data-role="error" aria-live="polite">{this.error}</p>
        <div class="actions">
          <ui-button type="submit" variant="primary">Add to vault</ui-button>
        </div>
      </form>
    )
  }
}
