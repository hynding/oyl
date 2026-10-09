import { AttachInternals, Component, Element, Event, Prop, Watch, h, type EventEmitter } from '@stencil/core'

let nextId = 0

/**
 * Multiline sibling of ui-field: label + textarea + hint/error with the aria wiring done,
 * form-associated, auto-growing. ⌘/Ctrl+Enter emits `uiSubmit` so a host form can submit.
 */
@Component({ tag: 'ui-textarea', styleUrl: 'ui-textarea.css', shadow: true, formAssociated: true })
export class UiTextarea {
  @Element() host!: HTMLElement
  @AttachInternals() internals!: ElementInternals

  @Prop() label!: string
  @Prop({ reflect: true }) name!: string
  @Prop({ mutable: true }) value = ''
  @Prop() placeholder?: string
  @Prop() required = false
  /** Minimum visible rows; the box grows with content when `autogrow` is on. */
  @Prop() rows = 2
  @Prop() autogrow = true
  @Prop() hint?: string
  @Prop() error?: string

  /** Every keystroke, `{ value }` (composed). The native input/change events stop at the shadow boundary. */
  @Event({ bubbles: true, composed: true }) uiInput!: EventEmitter<{ value: string }>
  @Event({ bubbles: true, composed: true }) uiChange!: EventEmitter<{ value: string }>
  /** ⌘/Ctrl+Enter inside the textarea — the host form's submit shortcut. */
  @Event({ bubbles: true, composed: true }) uiSubmit!: EventEmitter<void>

  private id = `ui-textarea-${++nextId}`

  componentWillLoad() {
    this.internals.setFormValue(this.value)
  }

  @Watch('value')
  syncFormValue(value: string) {
    this.internals.setFormValue(value)
    this.grow()
  }

  private grow() {
    if (!this.autogrow) return
    const el = this.host.shadowRoot?.querySelector('textarea')
    if (!el) return
    el.style.height = 'auto'
    if (el.scrollHeight) el.style.height = `${el.scrollHeight}px`
  }

  private onInput = (ev: Event) => {
    ev.stopPropagation()
    this.value = (ev.target as HTMLTextAreaElement).value
    this.uiInput.emit({ value: this.value })
  }

  private onChange = (ev: Event) => {
    ev.stopPropagation()
    this.uiChange.emit({ value: this.value })
  }

  private onKeydown = (ev: KeyboardEvent) => {
    if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault()
      this.uiSubmit.emit()
    }
  }

  render() {
    const describedBy = this.error ? `${this.id}-error` : this.hint ? `${this.id}-hint` : undefined
    return (
      <div class="field">
        <label htmlFor={this.id}>{this.label}</label>
        <textarea
          id={this.id}
          name={this.name}
          value={this.value}
          placeholder={this.placeholder}
          required={this.required}
          rows={this.rows}
          aria-invalid={this.error ? 'true' : undefined}
          aria-describedby={describedBy}
          onInput={this.onInput}
          onChange={this.onChange}
          onKeyDown={this.onKeydown}
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
