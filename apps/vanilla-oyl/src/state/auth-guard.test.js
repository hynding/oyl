import { describe, expect, it } from 'vitest'
import { User } from '@oyl/all-of-oyl'
import { shouldRedirectToLogin, tzNeedsReload } from './auth-guard.js'

const session = { token: 't', user: { id: 1, username: 'a', email: 'a@b.c' } }

describe('shouldRedirectToLogin', () => {
  it('redirects only when remote + no session + not already on an auth page', () => {
    expect(shouldRedirectToLogin('remote', null, 'status')).toBe(true)
    expect(shouldRedirectToLogin('remote', null, 'login')).toBe(false)
    expect(shouldRedirectToLogin('remote', null, 'register')).toBe(false)
    expect(shouldRedirectToLogin('remote', session, 'status')).toBe(false)
    expect(shouldRedirectToLogin('local', null, 'status')).toBe(false)
  })
})

describe('tzNeedsReload', () => {
  it('is true when the pulled profile tz differs from the tz screens were built with', () => {
    const u = new User({ displayName: 'A', timezone: 'Asia/Tokyo', defaultCurrency: 'USD' })
    expect(tzNeedsReload('UTC', u, 'UTC')).toBe(true)
    expect(tzNeedsReload('Asia/Tokyo', u, 'UTC')).toBe(false)
    expect(tzNeedsReload('UTC', null, 'UTC')).toBe(false)
  })
})
