import { Component, Element, Event, Prop, State, h, type EventEmitter } from '@stencil/core'
import { GiftIdea, Id, type Contact } from '@oyl/all-of-oyl'
import { effect } from '@oyl/all-of-oyl/client'
import { clearFields, fieldValue } from '../../vault/format.js'

export interface GiftIdeasWriter {
  contacts(): readonly Contact[]
  addGiftIdea(g: GiftIdea): Promise<unknown>
}

/**
 * Add a gift idea for a contact. Without contacts it shows a hint instead of the fields.
 * The form owns `contactId` and re-derives it when the contact list changes (kept when still
 * present, else the first contact) because `ui-select` syncs its own value silently.
 */
@Component({ tag: 'oyl-gift-idea-form', styleUrl: 'oyl-gift-idea-form.css', shadow: true })
export class OylGiftIdeaForm {
  @Element() host!: HTMLElement

  @Prop() store!: GiftIdeasWriter

  /** A gift idea was added through the store. */
  @Event() added!: EventEmitter<void>

  @State() contactList: readonly Contact[] = []
  @State() contactId = ''
  @State() error = ''

  private stop = () => {}

  componentWillLoad() {
    this.stop = effect(() => {
      this.contactList = this.store.contacts()
      if (!this.contactList.some((c) => c.id === this.contactId)) this.contactId = this.contactList[0]?.id ?? ''
    })
  }

  disconnectedCallback() {
    this.stop()
  }

  private onSubmit = (ev: Event) => {
    ev.preventDefault()
    void this.submit()
  }

  private onContact = (e: CustomEvent<{ value: string }>) => {
    e.stopPropagation()
    this.contactId = e.detail.value
  }

  private async submit() {
    this.error = ''
    const sr = this.host.shadowRoot
    try {
      await this.store.addGiftIdea(new GiftIdea({ text: fieldValue(sr, 'giftText'), contactId: Id.of(this.contactId) }))
      clearFields(sr)
      this.added.emit()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    }
  }

  render() {
    if (this.contactList.length === 0) return <p class="hint">Add a contact first.</p>
    return (
      <form onSubmit={this.onSubmit}>
        <div class="row2">
          <ui-field name="giftText" label="Idea" error={this.error || undefined} />
          <ui-select name="giftContact" label="For" options={this.contactList.map((c) => ({ value: c.id, label: c.name }))} value={this.contactId} onUiChange={this.onContact} />
        </div>
        <p data-role="error" aria-live="polite">{this.error}</p>
        <div class="actions">
          <ui-button type="submit" variant="primary">Add</ui-button>
        </div>
      </form>
    )
  }
}
