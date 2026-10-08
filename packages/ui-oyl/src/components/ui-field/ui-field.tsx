import { AttachInternals, Component, Event, Prop, Watch, h, type EventEmitter } from '@stencil/core'

export type FieldType = 'text' | 'email' | 'password' | 'number' | 'date'

let nextId = 0

/**
 * Label + input + hint/error in one shadow root, with the aria wiring done. Form-associated,
 * so a native light-DOM `<form>` sees its value (`FormData`, submit).
 */
@Component({ tag: 'ui-field', styleUrl: 'ui-field.css', shadow: true, formAssociated: true })
export class UiField {
  @AttachInternals() internals!: ElementInternals

  @Prop() label!: string
  @Prop() name!: string
  @Prop() type: FieldType = 'text'
  @Prop({ mutable: true }) value = ''
  @Prop() required = false
  @Prop() autocomplete?: string
  /** Supporting copy under the input; hidden while `error` is set. */
  @Prop() hint?: string
  /** Validation message; sets `aria-invalid` and replaces the hint. */
  @Prop() error?: string

  /**
   * Fires on every keystroke with `{ value }` (composed). The inner input's native
   * `input`/`change` events are stopped at the shadow boundary, so this is the only
   * value event consumers see.
   */
  @Event({ bubbles: true, composed: true }) uiInput!: EventEmitter<{ value: string }>
  /** Fires when the input commits (blur/enter) with `{ value }`. */
  @Event({ bubbles: true, composed: true }) uiChange!: EventEmitter<{ value: string }>

  private id = `ui-field-${++nextId}`

  componentWillLoad() {
    this.internals.setFormValue(this.value)
  }

  @Watch('value')
  syncFormValue(value: string) {
    this.internals.setFormValue(value)
  }

  private onInput = (ev: Event) => {
    ev.stopPropagation()
    this.value = (ev.target as HTMLInputElement).value
    this.uiInput.emit({ value: this.value })
  }

  private onChange = (ev: Event) => {
    ev.stopPropagation()
    this.uiChange.emit({ value: this.value })
  }

  render() {
    const describedBy = this.error ? `${this.id}-error` : this.hint ? `${this.id}-hint` : undefined
    return (
      <div class="field">
        <label htmlFor={this.id}>{this.label}</label>
        <input
          id={this.id}
          name={this.name}
          type={this.type}
          value={this.value}
          required={this.required}
          autocomplete={this.autocomplete}
          aria-invalid={this.error ? 'true' : undefined}
          aria-describedby={describedBy}
          onInput={this.onInput}
          onChange={this.onChange}
        />
        {this.error ? (
          <p class="error" id={`${this.id}-error`}>{this.error}</p>
        ) : this.hint ? (
          <p class="hint" id={`${this.id}-hint`}>{this.hint}</p>
        ) : null}
      </div>
    )
  }
}
