import { signal } from '../reactive/signal.js'
import { AUTH_KEY } from '../storage/keys.js'
import type { EnumerableStorage, FetchFn, HistoryLike, LocationLike } from '../ports.js'

export type AuthUser = { id: number, username: string, email: string }
export type AuthSession = { token: string, user: AuthUser } | null
type AppStorage = Pick<EnumerableStorage, 'getItem' | 'setItem' | 'removeItem'>

function readSession(storage: AppStorage): AuthSession {
  try { const raw = storage.getItem(AUTH_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}

/** Auth state: a session signal + login/register/logout/getToken/refresh. */
export function createAuthState(storage: AppStorage, { baseUrl, fetch }: { baseUrl: string, fetch: FetchFn }) {
  const session = signal(readSession(storage) as AuthSession)
  const persist = (s: AuthSession) => {
    if (s) storage.setItem(AUTH_KEY, JSON.stringify(s))
    else storage.removeItem(AUTH_KEY)
    session.set(s)
  }
  async function authRequest(path: string, body: Record<string, string>): Promise<AuthUser> {
    const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = (await res.json().catch(() => ({}))) as any
    if (!res.ok) throw new Error(data?.error?.message || `auth failed (${res.status})`)
    persist({ token: data.jwt, user: data.user })
    return data.user
  }
  return {
    session,
    login: (identifier: string, password: string) => authRequest('/auth/local', { identifier, password }),
    register: (username: string, email: string, password: string) => authRequest('/auth/local/register', { username, email, password }),
    logout: () => persist(null),
    getToken: async (): Promise<string | null> => session.get()?.token ?? null,
    /** Multi-tab: re-read the session from storage. */
    refresh: () => session.set(readSession(storage)),
    /**
     * Adopt an OAuth-callback session from the URL fragment (#google=<jwt>) or surface
     * a callback error (#google_error=<code>). Always cleans the hash first — the
     * fragment must not survive into history or a shared link.
     */
    async adoptTokenFromHash(win: { location: Pick<LocationLike, 'hash' | 'pathname' | 'search'>, history: Pick<HistoryLike, 'replaceState'> }): Promise<{ adopted: boolean, error: string | null }> {
      const hash = win.location.hash
      const token = hash.startsWith('#google=') ? decodeURIComponent(hash.slice('#google='.length)) : null
      const errorCode = hash.startsWith('#google_error=') ? decodeURIComponent(hash.slice('#google_error='.length)) : null
      if (token == null && errorCode == null) return { adopted: false, error: null }
      win.history.replaceState(null, '', win.location.pathname + win.location.search)
      if (errorCode != null) return { adopted: false, error: errorCode }
      const res = await fetch(`${baseUrl}/users/me`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return { adopted: false, error: 'session' }
      const user = (await res.json()) as { id: number, username: string, email: string }
      persist({ token: token as string, user: { id: user.id, username: user.username, email: user.email } })
      return { adopted: true, error: null }
    },
  }
}

/** Human messages for /google/callback error codes (hash `#google_error=<code>`). */
export function googleErrorMessage(code: string): string {
  const messages = {
    denied: 'Google sign-in was cancelled.',
    bad_state: 'The Google sign-in link expired. Please try again.',
    account_exists: 'An account with this email already exists. Sign in with your password, then connect Google from your Profile.',
    no_refresh_token: 'Google did not grant offline access. Please try connecting again.',
    exchange_failed: 'Google sign-in failed. Please try again.',
    already_linked: 'This Google account is already connected to a different OYL account.',
    unknown: 'Google sign-in failed. Please try again.',
  } as Record<string, string>
  return messages[code] ?? 'Google sign-in failed. Please try again.'
}
