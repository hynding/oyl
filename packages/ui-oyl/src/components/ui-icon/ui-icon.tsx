import { Component, Prop, h } from '@stencil/core'

@Component({ tag: 'ui-icon', styleUrl: 'ui-icon.css', shadow: true })
export class UiIcon {
  @Prop() name!: string

  render() {
    return <span />
  }
}
