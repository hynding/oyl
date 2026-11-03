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
        <ui-button href="/journal" slot="footer">Go to Journal</ui-button>
      </ui-card>
    )
  }
}
