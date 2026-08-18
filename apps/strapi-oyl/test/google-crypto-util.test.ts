import { describe, it, expect, beforeAll } from 'vitest'
import { encryptToken, decryptToken, signState, verifyState, type OauthState } from '../src/utils/google-crypto'
import { googleConfig } from '../src/utils/google-config'

beforeAll(() => {
  process.env['ENCRYPTION_KEY'] = 'testtesttesttesttesttesttesttest'
  process.env['JWT_SECRET'] = 'test'
})

describe('google-crypto: refresh-token encryption', () => {
  it('round-trips a token', () => {
    const packed = encryptToken('1//refresh-token-value')
    expect(packed).not.toContain('refresh-token-value')
    expect(decryptToken(packed)).toBe('1//refresh-token-value')
  })
  it('uses a random IV (two encryptions differ)', () => {
    expect(encryptToken('same')).not.toBe(encryptToken('same'))
  })
  it('rejects a tampered ciphertext', () => {
    const packed = encryptToken('secret')
    const parts = packed.split('.')
    parts[2] = parts[2].slice(0, -2) + (parts[2].endsWith('AA') ? 'BB' : 'AA')
    expect(() => decryptToken(parts.join('.'))).toThrow()
  })
})

describe('google-crypto: oauth state', () => {
  const state: OauthState = { nonce: 'n1', mode: 'login', retried: false, exp: 2_000_000_000_000 }
  it('round-trips a signed state', () => {
    expect(verifyState(signState(state), 1_000_000_000_000)).toEqual(state)
  })
  it('rejects a tampered payload', () => {
    const raw = signState(state)
    const [payload, sig] = raw.split('.')
    const forged = Buffer.from(JSON.stringify({ ...state, mode: 'link', userId: 1 })).toString('base64url')
    expect(verifyState(`${forged}.${sig}`, 1_000_000_000_000)).toBeNull()
    expect(verifyState(`${payload}.`, 1_000_000_000_000)).toBeNull()
    expect(verifyState('garbage', 1_000_000_000_000)).toBeNull()
  })
  it('rejects an expired state', () => {
    expect(verifyState(signState(state), state.exp + 1)).toBeNull()
  })
  it('carries link mode with userId', () => {
    const link: OauthState = { nonce: 'n2', mode: 'link', retried: true, userId: 42, exp: 2_000_000_000_000 }
    expect(verifyState(signState(link), 0)).toEqual(link)
  })
})

describe('google-config', () => {
  it('is unconfigured without client credentials', () => {
    delete process.env['GOOGLE_CLIENT_ID']
    delete process.env['GOOGLE_CLIENT_SECRET']
    expect(googleConfig().configured).toBe(false)
  })
  it('is configured with credentials and applies Google defaults + env overrides', () => {
    process.env['GOOGLE_CLIENT_ID'] = 'cid'
    process.env['GOOGLE_CLIENT_SECRET'] = 'sec'
    process.env['GOOGLE_REDIRECT_URI'] = 'http://localhost:1340/api/google/callback'
    process.env['APP_URL'] = 'http://localhost:8041'
    delete process.env['GOOGLE_TOKEN_URL']
    const c = googleConfig()
    expect(c.configured).toBe(true)
    expect(c.tokenUrl).toBe('https://oauth2.googleapis.com/token')
    expect(c.authBaseUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(c.revokeUrl).toBe('https://oauth2.googleapis.com/revoke')
    process.env['GOOGLE_TOKEN_URL'] = 'http://localhost:9999/token'
    expect(googleConfig().tokenUrl).toBe('http://localhost:9999/token')
  })
})
