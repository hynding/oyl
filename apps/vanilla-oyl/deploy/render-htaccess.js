// Pure template renderer for deploy/htaccess.template. No node:* imports (see csp-hashes.js).

const HEADER_NAMES = /^Content-Security-Policy(-Report-Only)?$/
// scheme://host[:port] — nothing after the authority; CSP connect-src wants an origin.
const ORIGIN = /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/
const PLACEHOLDER = /__[A-Z_]+__/

/**
 * @param {string} template
 * @param {{ header: string, hashes: string[], apiOrigin: string }} opts
 * @returns {string}
 */
export function renderHtaccess(template, { header, hashes, apiOrigin }) {
  if (!HEADER_NAMES.test(header)) throw new Error(`renderHtaccess: unsupported CSP header name "${header}"`)
  if (!ORIGIN.test(apiOrigin)) throw new Error(`renderHtaccess: apiOrigin must be a bare origin (scheme://host[:port]), got "${apiOrigin}"`)
  if (hashes.length === 0) throw new Error('renderHtaccess: no inline-script hashes — refusing to render a CSP that would block index.html')
  const out = template
    .replaceAll('__CSP_HEADER__', header)
    .replaceAll('__CSP_SCRIPT_HASHES__', hashes.map((h) => `'${h}'`).join(' '))
    .replaceAll('__API_ORIGIN__', apiOrigin)
  const left = PLACEHOLDER.exec(out)
  if (left) throw new Error(`renderHtaccess: unrendered placeholder ${left[0]}`)
  return out
}
