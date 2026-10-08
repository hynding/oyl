import { AttachInternals, Component, Element, Prop, h } from '@stencil/core'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

/**
 * The library's one clickable control: a button, or a link when `href` is set.
 * `type="submit"` submits the enclosing light-DOM form through `ElementInternals`,
 * so a native `<form>` works across the shadow boundary.
 */
@Component({ tag: 'ui-button', styleUrl: 'ui-button.css', shadow: true, formAssociated: true })
export class UiButton {
  @Element() host!: HTMLElement
  @AttachInternals() internals!: ElementInternals

  /** `primary` is the single accent-filled action per view; everything else is quiet. */
  @Prop({ reflect: true }) variant: ButtonVariant = 'secondary'
  /** `submit` submits the enclosing form; `button` does nothing on its own. */
  @Prop() type: 'button' | 'submit' = 'button'
  @Prop({ reflect: true }) disabled = false
  /** Render as a link to this URL instead of a button. */
  @Prop() href?: string

  private onClick = (ev: MouseEvent) => {
    if (this.disabled) {
      ev.preventDefault()
      ev.stopPropagation()
      return
    }
    if (this.type === 'submit') this.closestForm()?.requestSubmit()
  }

  private closestForm(): HTMLFormElement | null {
    return this.internals?.form ?? this.host.closest('form')
  }

  render() {
    const cls = { [this.variant]: true }
    if (this.href !== undefined) {
      return (
        <a
          class={cls}
          href={this.disabled ? undefined : this.href}
          aria-disabled={this.disabled ? 'true' : undefined}
          onClick={this.onClick}
        >
          <slot />
        </a>
      )
    }
    return (
      <button class={cls} type="button" disabled={this.disabled} onClick={this.onClick}>
        <slot />
      </button>
    )
  }
}
