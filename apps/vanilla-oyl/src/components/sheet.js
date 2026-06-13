/**
 * Build a Constructable Stylesheet from a CSS string, for adoptedStyleSheets.
 * @param {string} css
 * @returns {CSSStyleSheet}
 */
export function sheet(css) {
  const s = new CSSStyleSheet()
  s.replaceSync(css)
  return s
}
