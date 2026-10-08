import { Component, Prop, h } from '@stencil/core'

@Component({ tag: 'oyl-not-found', styleUrl: 'oyl-not-found.css', shadow: true })
export class OylNotFound {
  @Prop() route = ''

  render() {
    return (
      <ui-card heading="Not found">
        <p>
          There is no screen at <code>/{this.route}</code>.
        </p>
        <ui-button href="/status" slot="footer">Go to Status</ui-button>
      </ui-card>
    )
  }
}
