/**
 * The shared mobile presentation for toolbar popovers: below 641px the toolbar
 * squeezes its hosts leftward (theme toggle, layout picker and account menu
 * share the row), so a host-anchored flyout can overflow the LEFT viewport edge
 * and its options become unclickable (the regression e2e caught in Plan A).
 * Panels become viewport-anchored sheets under the header instead.
 * ONE source — interpolate into each component's sheet() as ${MOBILE_SHEET_CSS},
 * AFTER the base .panel rule (same specificity — order decides).
 * Clearances (header offset / bottom tab allowance) live here only.
 */
export const MOBILE_SHEET_CSS = `
  @media (max-width: 640px) {
    .panel {
      position: fixed; inset-inline: 1rem;
      inset-block-start: calc(env(safe-area-inset-top) + 3.25rem);
      inline-size: auto;
      max-block-size: calc(100dvh - env(safe-area-inset-top) - 8rem);
      overflow: auto;
    }
  }
`

/**
 * The shared outside-closer for toolbar popovers: pointer AND keyboard parity
 * (Enter-activated triggers fire no pointerdown; without focusin, keyboard-
 * opened popovers can stack). composedPath makes the containment check
 * shadow-safe.
 * @param {HTMLElement} host @param {HTMLElement} panel
 * @param {(open: boolean) => void} setOpen @param {AbortSignal} signal
 */
export function closeOnOutside(host, panel, setOpen, signal) {
  for (const type of ['pointerdown', 'focusin']) {
    document.addEventListener(
      type,
      (e) => {
        if (!panel.hidden && !e.composedPath().includes(host)) setOpen(false)
      },
      { signal },
    )
  }
}
