/**
 * Intercept same-origin left-clicks on anchors and route them client-side (pushState
 * fires no navigation event). One delegated click listener on `win.document` sees clicks
 * composed out of component shadow roots (ui-nav, cards). Port of vanilla's
 * state/link-interceptor.js. Returns the listener's disposer.
 */
export function interceptLinks(win: Window, navigate: (path: string) => void): () => void {
  const onClick = (event: Event) => {
    const e = event as MouseEvent
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

/** First HTMLAnchorElement on the composed path (crosses shadow roots). SVG <a> is excluded. */
function findAnchor(path: EventTarget[]): HTMLAnchorElement | null {
  for (const node of path) {
    if (node instanceof HTMLAnchorElement) return node
  }
  return null
}
