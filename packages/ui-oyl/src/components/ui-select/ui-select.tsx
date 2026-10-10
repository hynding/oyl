import { AttachInternals, Component, Event, Prop, Watch, h, type EventEmitter } from '@stencil/core'

export interface SelectOption {
  value: string
  label: string
}

let nextId = 0

/**
 * Label + native `<select>` + hint/error, the same anatomy and aria wiring as `ui-field`.
 * Form-associated. When `options` change under the current `value`, the value is synced to
 * the first option (or `''`) WITHOUT emitting `uiChange` — a sync, not a user choice.
 */
@Component({ tag: 'ui-select', styleUrl: 'ui-select.css', shadow: true, formAssociated: true })
export class UiSelect {
  @AttachInternals() internals!: ElementInternals

  @Prop() label!: string
  /** Reflected: attribute-shaped, like a native control's name. */
  @Prop({ reflect: true }) name!: string
  @Prop() options: readonly SelectOption[] = []
  @Prop({ mutable: true }) value = ''
  @Prop() disabled = false
  /** Supporting copy under the select; hidden while `error` is set. */
  @Prop() hint?: string
  /** Validation message; sets `aria-invalid` and replaces the hint. */
  @Prop() error?: string

  /** Fires when the user picks an option, with `{ value }` (composed); the inner `change` is stopped. */
  @Event({ bubbles: true, composed: true }) uiChange!: EventEmitter<{ value: string }>

  private id = `ui-select-${++nextId}`

  componentWillLoad() {
    this.syncValueToOptions()
    this.internals.setFormValue(this.value)
  }

  @Watch('value')
  syncFormValue(value: string) {
    this.internals.setFormValue(value)
  }

  @Watch('options')
  syncValueToOptions() {
    if (!this.options.some((o) => o.value === this.value)) this.value = this.options[0]?.value ?? ''
  }

  private onChange = (ev: Event) => {
    ev.stopPropagation()
    this.value = (ev.target as HTMLSelectElement).value
    this.uiChange.emit({ value: this.value })
  }

  render() {
    const describedBy = this.error ? `${this.id}-error` : this.hint ? `${this.id}-hint` : undefined
    return (
      <div class="field">
        <label htmlFor={this.id}>{this.label}</label>
        <select
          id={this.id}
          name={this.name}
          disabled={this.disabled}
          aria-invalid={this.error ? 'true' : undefined}
          aria-describedby={describedBy}
          onChange={this.onChange}
        >
          {this.options.map((o) => (
            <option value={o.value} selected={o.value === this.value}>{o.label}</option>
          ))}
        </select>
        {this.error ? (
          <p class="error" id={`${this.id}-error`}>{this.error}</p>
        ) : this.hint ? (
          <p class="hint" id={`${this.id}-hint`}>{this.hint}</p>
        ) : null}
      </div>
    )
  }
}
