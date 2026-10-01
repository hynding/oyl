import { describe, it, expect } from 'vitest'
import { renderHtaccess } from './render-htaccess.js'

const TEMPLATE = [
  'Header always set __CSP_HEADER__ "script-src \'self\' __CSP_SCRIPT_HASHES__; connect-src \'self\' __API_ORIGIN__"',
].join('\n')
const HASHES = ['sha256-aaaa', 'sha256-bbbb']

describe('renderHtaccess', () => {
  it('fills header name, quoted hashes and API origin', () => {
    const out = renderHtaccess(TEMPLATE, { header: 'Content-Security-Policy', hashes: HASHES, apiOrigin: 'https://api.example.test' })
    expect(out).toBe('Header always set Content-Security-Policy "script-src \'self\' \'sha256-aaaa\' \'sha256-bbbb\'; connect-src \'self\' https://api.example.test"')
  })

  it('accepts the report-only header name', () => {
    expect(renderHtaccess(TEMPLATE, { header: 'Content-Security-Policy-Report-Only', hashes: HASHES, apiOrigin: 'https://api.example.test' }))
      .toContain('Content-Security-Policy-Report-Only')
  })

  it('rejects any other header name', () => {
    expect(() => renderHtaccess(TEMPLATE, { header: 'X-CSP', hashes: HASHES, apiOrigin: 'https://api.example.test' })).toThrow(/header/)
  })

  it('rejects an API origin that carries a path, trailing slash or whitespace', () => {
    for (const bad of ['https://api.example.test/api', 'https://api.example.test/', 'https://api.example.test ', 'api.example.test']) {
      expect(() => renderHtaccess(TEMPLATE, { header: 'Content-Security-Policy', hashes: HASHES, apiOrigin: bad }), bad).toThrow(/origin/)
    }
  })

  it('rejects an empty hash list (a CSP with no inline hashes would white-screen the app)', () => {
    expect(() => renderHtaccess(TEMPLATE, { header: 'Content-Security-Policy', hashes: [], apiOrigin: 'https://api.example.test' })).toThrow(/hash/)
  })

  it('fails on an unrendered placeholder', () => {
    expect(() => renderHtaccess('__NOPE__', { header: 'Content-Security-Policy', hashes: HASHES, apiOrigin: 'https://api.example.test' })).toThrow(/__NOPE__/)
  })
})
