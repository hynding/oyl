import { Component, Element, Event, Prop, State, h, type EventEmitter } from '@stencil/core'
import { Cadence, Contact, DayKey } from '@oyl/all-of-oyl'
import { clearFields, fieldValue } from '../../vault/format.js'

export interface ContactsWriter {
  addContact(c: Contact): Promise<unknown>
}

/** Add a contact: name, optional birthday (a yearly occasion) and last-contacted day. */
@Component({ tag: 'oyl-contact-form', styleUrl: 'oyl-contact-form.css', shadow: true })
export class OylContactForm {
  @Element() host!: HTMLElement

  @Prop() store!: ContactsWriter

  /** A contact was added through the store. */
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
      const props: ConstructorParameters<typeof Contact>[0] = { name: fieldValue(sr, 'name') }
      const last = fieldValue(sr, 'lastContacted')
      if (last) props.lastContactedOn = DayKey.of(last)
      const birthday = fieldValue(sr, 'birthday')
      if (birthday) props.occasions = [{ name: 'birthday', anchor: DayKey.of(birthday), cadence: Cadence.of(1, 'years') }]
      await this.store.addContact(new Contact(props))
      clearFields(sr)
      this.added.emit()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    }
  }

  render() {
    return (
      <form onSubmit={this.onSubmit}>
        <ui-field name="name" label="Name" error={this.error || undefined} />
        <div class="row2">
          <ui-field name="birthday" label="Birthday (optional)" type="date" />
          <ui-field name="lastContacted" label="Last contacted (optional)" type="date" />
        </div>
        <p data-role="error" aria-live="polite">{this.error}</p>
        <div class="actions">
          <ui-button type="submit" variant="primary">Add to vault</ui-button>
        </div>
      </form>
    )
  }
}
