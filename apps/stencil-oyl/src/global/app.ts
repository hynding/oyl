/**
 * Stencil global script: runs once when the bundle loads, before any component.
 *
 * 1. Importing the client layer here puts ONE copy of the reactive core in the shared chunk
 *    that every component entry imports — rather than a copy per entry, which would mean
 *    screens silently stop updating. `src/index.ts` re-exports the same instance for specs.
 * 2. @oyl/ui-oyl's elements are consumed as built custom elements; they are plain tags to
 *    this app's compiler, so they must be registered explicitly. Tree-shaken to the ones
 *    the shell uses.
 */
import '@oyl/all-of-oyl/client'
import {
  defineCustomElementUiButton, defineCustomElementUiCard, defineCustomElementUiCheckbox, defineCustomElementUiField,
  defineCustomElementUiIcon, defineCustomElementUiNav, defineCustomElementUiNotice,
  defineCustomElementUiSegment, defineCustomElementUiTextarea,
} from '@oyl/ui-oyl'

export default function () {
  defineCustomElementUiIcon()
  defineCustomElementUiButton()
  defineCustomElementUiField()
  defineCustomElementUiCheckbox()
  defineCustomElementUiTextarea()
  defineCustomElementUiSegment()
  defineCustomElementUiCard()
  defineCustomElementUiNotice()
  defineCustomElementUiNav()
}
