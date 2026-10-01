// DOM-free, Node-free CSP helper: hashes inline <script> bodies the way a browser computes
// 'sha256-…' source expressions. Used by scripts/render-htaccess.mjs at publish time and
// unit-tested here; it must not import node:* (apps/vanilla-oyl typechecks with types: []).

// Matches <script> tags with attributes, handling quoted > inside attribute values.
// Capture group 1: attributes string; group 2: body.
const SCRIPT_TAG = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script>/gi
// Matches a real src= attribute (not data-src= or similar) in an attributes string.
const HAS_SRC = /(^|\s)src\s*=/i

/** @param {Uint8Array} bytes @returns {string} */
function toBase64(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

/**
 * One `sha256-<base64>` token per inline `<script>` (no `src`), in document order, hashing the
 * exact text between the tags.
 * @param {string} html
 * @returns {Promise<string[]>}
 */
export async function hashInlineScripts(html) {
  /** @type {string[]} */
  const out = []
  for (const m of html.matchAll(SCRIPT_TAG)) {
    const attrs = m[1] ?? ''
    if (HAS_SRC.test(attrs)) continue
    const body = /** @type {string} */ (m[2])
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
    out.push(`sha256-${toBase64(new Uint8Array(digest))}`)
  }
  return out
}
