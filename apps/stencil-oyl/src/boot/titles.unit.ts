import { describe, expect, it } from 'vitest'
import { titleFor } from './titles.js'

describe('titleFor', () => {
  it('names the nav screens, the auth pages and profile; everything else is Not found', () => {
    expect(titleFor('journal')).toBe('Journal · OYL')
    expect(titleFor('status')).toBe('Status · OYL')
    expect(titleFor('profile')).toBe('Profile · OYL')
    expect(titleFor('login')).toBe('Sign in · OYL')
    expect(titleFor('register')).toBe('Register · OYL')
    expect(titleFor('nope')).toBe('Not found · OYL')
    expect(titleFor('')).toBe('Not found · OYL')
  })
})
