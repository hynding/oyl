import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const SCHEMA = path.resolve(__dirname, '..', 'src', 'api', 'google-account', 'content-types', 'google-account', 'schema.json')

describe('google-account content-type', () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf-8')) as Record<string, any>
  const attrs = schema['attributes'] as Record<string, any>

  it('is a collectionType named google-account with no draftAndPublish', () => {
    expect(schema['kind']).toBe('collectionType')
    expect(schema['info']['singularName']).toBe('google-account')
    expect(schema['options']['draftAndPublish']).toBe(false)
  })
  it('googleUserId is a required unique string', () => {
    expect(attrs['googleUserId']).toMatchObject({ type: 'string', required: true, unique: true })
  })
  it('refreshToken is text and PRIVATE (never serialized into REST responses)', () => {
    expect(attrs['refreshToken']).toMatchObject({ type: 'text', private: true })
  })
  it('user is a oneToOne relation to the users-permissions user', () => {
    expect(attrs['user']).toMatchObject({ type: 'relation', relation: 'oneToOne', target: 'plugin::users-permissions.user' })
  })
  it('has NO routes or controllers (custom API only)', () => {
    const apiDir = path.resolve(__dirname, '..', 'src', 'api', 'google-account')
    expect(fs.existsSync(path.join(apiDir, 'routes'))).toBe(false)
    expect(fs.existsSync(path.join(apiDir, 'controllers'))).toBe(false)
  })
})
