import { AttachInternals, Component, Event, Prop, Watch, h, type EventEmitter } from '@stencil/core'

let nextId = 0

/**
 * A labeled checkbox. Form-associated: a native light-DOM `<form>` sees `value`
 * (default `"on"`) while checked and nothing while unchecked, like a native checkbox.
 */
@Component({ tag: 'ui-checkbox', styleUrl: 'ui-checkbox.css', shadow: true, formAssociated: true })
export class UiCheckbox {
  @AttachInternals() internals!: ElementInternals

  @Prop() label!: string
  /** Reflected: attribute-shaped, like a native control's name. */
  @Prop({ reflect: true }) name!: string
  @Prop({ mutable: true, reflect: true }) checked = false
  @Prop() disabled = false
  /** The form value submitted while checked. */
  @Prop() value = 'on'

  /** Fires on every toggle with `{ checked }` (composed); the inner input's `change` is stopped. */
  @Event({ bubbles: true, composed: true }) uiChange!: EventEmitter<{ checked: boolean }>

  private id = `ui-checkbox-${++nextId}`

  componentWillLoad() {
    this.syncFormValue()
  }

  @Watch('checked')
  @Watch('value')
  syncFormValue() {
    this.internals.setFormValue(this.checked ? this.value : null)
  }

  private onChange = (ev: Event) => {
    ev.stopPropagation()
    this.checked = (ev.target as HTMLInputElement).checked
    this.uiChange.emit({ checked: this.checked })
  }

  render() {
    return (
      <label htmlFor={this.id} class={{ disabled: this.disabled }}>
        <input
          id={this.id}
          type="checkbox"
          name={this.name}
          checked={this.checked}
          disabled={this.disabled}
          onChange={this.onChange}
        />
        <span>{this.label}</span>
      </label>
    )
  }
}
