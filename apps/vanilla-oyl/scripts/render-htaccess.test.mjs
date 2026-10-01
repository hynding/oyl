// @vitest-environment node
// (the global happy-dom environment shadows URL with one that resolves relative file
// URLs against http://localhost, breaking `new URL('..', import.meta.url)` below.)
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = fileURLToPath(new URL('..', import.meta.url))
const CLI = join(APP, 'scripts', 'render-htaccess.mjs')
const INDEX = join(APP, 'index.html')

/** @param {string[]} args */
function render(args) {
  const dir = mkdtempSync(join(tmpdir(), 'htaccess-'))
  const out = join(dir, '.htaccess')
  try {
    execFileSync('node', [CLI, '--html', INDEX, '--out', out, ...args], { stdio: 'pipe' })
    return readFileSync(out, 'utf8')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('scripts/render-htaccess.mjs against the real index.html + template', () => {
  it('renders two inline-script hashes (anti-FOUC IIFE + importmap), the scoped SPA fallback, the DEPLOYED deny, cache rules, no placeholders', () => {
    const text = render(['--api-origin', 'https://api.example.test'])
    expect(text.match(/'sha256-[A-Za-z0-9+/=]+'/g)).toHaveLength(2)
    expect(text).toContain('Header always set Content-Security-Policy "')
    expect(text).toContain("connect-src 'self' https://api.example.test;")
    expect(text).toContain('RewriteCond %{REQUEST_URI} !^/(src|styles|vendor)/')
    expect(text).toContain('RewriteRule ^ /index.html [L]')
    expect(text).toContain('<Files "DEPLOYED">')
    expect(text).toContain('Require all denied')
    expect(text).toContain('Header always set Cache-Control "no-cache"')
    expect(text).toContain('max-age=0, must-revalidate')
    expect(text).not.toMatch(/__[A-Z_]+__/)
    expect(text).not.toContain('googleapis')
  })

  it('honours --csp-header Content-Security-Policy-Report-Only', () => {
    expect(render(['--api-origin', 'https://api.example.test', '--csp-header', 'Content-Security-Policy-Report-Only']))
      .toContain('Header always set Content-Security-Policy-Report-Only "')
  })

  it('fails (exit 2) without --api-origin, and (exit 1) on an origin with a path', () => {
    expect(() => render([])).toThrow()
    expect(() => render(['--api-origin', 'https://api.example.test/api'])).toThrow(/origin/)
  })

  it('rejects a flag given as a value instead of a missing value silently shifting the rest of the pairs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'htaccess-'))
    const out = join(dir, '.htaccess')
    try {
      expect(() =>
        execFileSync('node', [CLI, '--api-origin', '--out', out, '--html', INDEX], { stdio: 'pipe' })
      ).toThrow(/--api-origin needs a value/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects a repeated flag', () => {
    expect(() =>
      render(['--api-origin', 'https://api.example.test', '--api-origin', 'https://other.example.test'])
    ).toThrow(/duplicate argument --api-origin/)
  })
})
