/**
 * True when a keyboard event originates in a control that owns its arrow keys — a text
 * field, a select, or a radio (ui-segment's options) — so a screen's day navigation
 * must leave the key alone. Reads the composed path, so it works across shadow roots.
 */
export function isEditableTarget(e: Event): boolean {
  const target = e.composedPath()[0] as Element | undefined
  const tag = target?.tagName ?? ''
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.getAttribute?.('role') === 'radio'
}
