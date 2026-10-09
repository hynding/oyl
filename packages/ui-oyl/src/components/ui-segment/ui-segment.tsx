import { Component, Event, Prop, h, type EventEmitter } from '@stencil/core'

export interface SegmentOption {
  value: string
  label: string
}

/**
 * A segmented control: a small set of mutually exclusive choices as a radiogroup with
 * roving tabindex and arrow-key selection. Options render as native buttons carrying
 * `data-value` (the e2e selector).
 */
@Component({ tag: 'ui-segment', styleUrl: 'ui-segment.css', shadow: true })
export class UiSegment {
  @Prop({ reflect: true }) name?: string
  /** Accessible name of the group. */
  @Prop() label!: string
  @Prop() options: SegmentOption[] = []
  @Prop({ mutable: true, reflect: true }) value = ''

  @Event({ bubbles: true, composed: true }) uiChange!: EventEmitter<{ value: string }>

  private select(value: string) {
    if (value === this.value) return
    this.value = value
    this.uiChange.emit({ value })
  }

  private onKeydown = (e: KeyboardEvent) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!delta || this.options.length === 0) return
    e.preventDefault()
    const i = this.options.findIndex((o) => o.value === this.value)
    const next = this.options[(i + delta + this.options.length) % this.options.length]!
    this.select(next.value)
    const group = e.currentTarget as HTMLElement
    ;(group.querySelector(`[data-value="${CSS.escape(next.value)}"]`) as HTMLElement | null)?.focus()
  }

  render() {
    return (
      <div class="track" role="radiogroup" aria-label={this.label} onKeyDown={this.onKeydown}>
        {this.options.map((o) => {
          const checked = o.value === this.value
          return (
            <button
              type="button"
              role="radio"
              data-value={o.value}
              aria-checked={String(checked)}
              tabindex={checked ? 0 : -1}
              onClick={() => this.select(o.value)}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    )
  }
}
