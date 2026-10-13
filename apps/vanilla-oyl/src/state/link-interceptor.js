/**
 * Intercept same-origin left-clicks on anchors and route them client-side.
 * pushState fires no navigation event, so anchor clicks must be captured
 * manually. Attaches a single delegated click listener on `win.document`,
 * which sees clicks composed out of component shadow roots (e.g. <oyl-nav>).
 * @param {Window} win
 * @param {(path: string) => void} navigate  receives `pathname` + optional `?search`
 * @returns {() => void} stop  remove the listener
 */
export function interceptLinks(win, navigate) {
  /** @param {Event} event */
  const onClick = (event) => {
    const e = /** @type {MouseEvent} */ (event)
    if (e.defaultPrevented || e.button !== 0) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const anchor = findAnchor(e.composedPath())
    if (!anchor) return
    if (anchor.target || anchor.hasAttribute('download') || anchor.getAttribute('rel') === 'external') return
    const url = new URL(anchor.href, win.location.href)
    if (url.origin !== win.location.origin) return
    // Same-page hash link: let the browser handle native scroll.
    if (url.pathname === win.location.pathname && url.hash) return
    e.preventDefault()
    navigate(url.pathname + url.search)
  }
  win.document.addEventListener('click', onClick)
  return () => win.document.removeEventListener('click', onClick)
}

/**
 * First HTMLAnchorElement on the event's composed path (crosses shadow roots).
 * SVG `<a>` (SVGAElement) is intentionally excluded — it is not an
 * HTMLAnchorElement and its `href` is not a string.
 * @param {EventTarget[]} path
 * @returns {HTMLAnchorElement | null}
 */
function findAnchor(path) {
  for (const node of path) {
    if (node instanceof HTMLAnchorElement) return node
  }
  return null
}
