import { describe, expect, it } from 'vitest'
import { isAdminEmail, parseAdminList } from '../src/utils/admins'

describe('parseAdminList', () => {
  it('splits on commas and whitespace, lower-cases, drops blanks', () => {
    expect(parseAdminList(' Steve@Example.com, ,@Admin.Test  other@x.dev ')).toEqual(['steve@example.com', '@admin.test', 'other@x.dev'])
  })
  it('treats unset/empty as nobody', () => {
    expect(parseAdminList(undefined)).toEqual([])
    expect(parseAdminList('')).toEqual([])
  })
})

describe('isAdminEmail', () => {
  it('matches an exact address, case-insensitively', () => {
    expect(isAdminEmail('STEVE@example.com', 'steve@example.com')).toBe(true)
    expect(isAdminEmail('someone@example.com', 'steve@example.com')).toBe(false)
  })
  it('an @domain entry matches every address on exactly that domain', () => {
    expect(isAdminEmail('a@admin.test', '@admin.test')).toBe(true)
    expect(isAdminEmail('a@sub.admin.test', '@admin.test')).toBe(false)
    expect(isAdminEmail('a@notadmin.test', '@admin.test')).toBe(false)
  })
  it('nobody is an admin when the list is unset, and a missing email never matches', () => {
    expect(isAdminEmail('steve@example.com', undefined)).toBe(false)
    expect(isAdminEmail(undefined, 'steve@example.com')).toBe(false)
    expect(isAdminEmail('', '@')).toBe(false)
  })
})
