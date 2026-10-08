import { Component, Prop, h } from '@stencil/core'

/** Placeholder for a screen the redesign has not reached yet (sub-projects 3…n replace these). */
@Component({ tag: 'oyl-not-yet', styleUrl: 'oyl-not-yet.css', shadow: true })
export class OylNotYet {
  @Prop() name!: string
  /** The classic app's URL for this screen; omit to hide the link. */
  @Prop() classicUrl?: string

  render() {
    return (
      <ui-card heading={this.name}>
        <p>{this.name} is coming to the new OYL. Use the classic app for now.</p>
        {this.classicUrl && (
          <ui-button href={this.classicUrl} slot="footer">
            Open in classic <ui-icon name="chevron-right" size="s" />
          </ui-button>
        )}
      </ui-card>
    )
  }
}
