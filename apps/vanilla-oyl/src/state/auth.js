import { signal } from '../lib/reactive/signal.js'
import { AUTH_KEY } from '../storage/keys.js'

/** @typedef {{ id: number, username: string, email: string }} AuthUser */
/** @typedef {{ token: string, user: AuthUser } | null} AuthSession */
/** @typedef {{ getItem(k: string): string | null, setItem(k: string, v: string): void, removeItem(k: string): void }} AppStorage */

/** @param {AppStorage} storage @returns {AuthSession} */
function readSession(storage) {
  try { const raw = storage.getItem(AUTH_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}

/** Auth state: a session signal + login/register/logout/getToken/refresh. @param {AppStorage} storage @param {{ baseUrl: string, fetch: typeof globalThis.fetch }} opts */
export function createAuthState(storage, { baseUrl, fetch }) {
  const session = signal(/** @type {AuthSession} */ (readSession(storage)))
  /** @param {AuthSession} s */
  const persist = (s) => {
    if (s) storage.setItem(AUTH_KEY, JSON.stringify(s))
    else storage.removeItem(AUTH_KEY)
    session.set(s)
  }
  /** @param {string} path @param {Record<string, string>} body @returns {Promise<AuthUser>} */
  async function authRequest(path, body) {
    const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = /** @type {any} */ (await res.json().catch(() => ({})))
    if (!res.ok) throw new Error(data?.error?.message || `auth failed (${res.status})`)
    persist({ token: data.jwt, user: data.user })
    return data.user
  }
  return {
    session,
    /** @param {string} identifier @param {string} password */
    login: (identifier, password) => authRequest('/auth/local', { identifier, password }),
    /** @param {string} username @param {string} email @param {string} password */
    register: (username, email, password) => authRequest('/auth/local/register', { username, email, password }),
    logout: () => persist(null),
    /** @returns {Promise<string | null>} */
    getToken: async () => session.get()?.token ?? null,
    /** Multi-tab: re-read the session from storage. */
    refresh: () => session.set(readSession(storage)),
  }
}
