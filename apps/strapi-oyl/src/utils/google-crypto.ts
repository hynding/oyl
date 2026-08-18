/**
 * Crypto for the Google connection: refresh-token encryption at rest and the
 * signed OAuth `state` parameter. Keys are DERIVED (SHA-256) from existing env
 * secrets so no new secret needs provisioning; the derivation is part of the
 * stored-ciphertext format — changing it invalidates stored refresh tokens.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const encKey = () => createHash('sha256').update(process.env['ENCRYPTION_KEY'] ?? '').digest()
const stateKey = () => createHash('sha256').update('google-state:' + (process.env['JWT_SECRET'] ?? '')).digest()

/** AES-256-GCM; packed as `iv.tag.ciphertext` (base64url). */
export function encryptToken(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encKey(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}

export function decryptToken(packed: string): string {
  const [iv, tag, data] = packed.split('.')
  if (!iv || !tag || !data) throw new Error('malformed packed token')
  const decipher = createDecipheriv('aes-256-gcm', encKey(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}

/** The signed OAuth round-trip state. `retried` guards the prompt=consent loop; `userId` only in link mode. */
export type OauthState = { nonce: string; mode: 'login' | 'link'; retried: boolean; userId?: number; exp: number }

/** `payload.sig` (both base64url); HMAC-SHA256 over the payload. */
export function signState(state: OauthState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url')
  const sig = createHmac('sha256', stateKey()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

/** Null on any failure (malformed, bad signature, expired) — callers redirect with `bad_state`. */
export function verifyState(raw: string, nowMs: number): OauthState | null {
  const [payload, sig] = raw.split('.')
  if (!payload || !sig) return null
  const expected = createHmac('sha256', stateKey()).update(payload).digest()
  let given: Buffer
  try { given = Buffer.from(sig, 'base64url') } catch { return null }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OauthState
    return state.exp > nowMs ? state : null
  } catch { return null }
}
