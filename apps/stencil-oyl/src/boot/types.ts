import type {
  createAuthState, createDataState, createGoogleStore, createNoticeState, createProfileStore, createRouteState, Signal,
} from '@oyl/all-of-oyl/client'
import type { ThemeState } from './theme.js'
import type { GlobalLike } from './ports.js'

export type StorageMode = 'local' | 'remote'

/** The slice of `window` the boot reads (a structural port, so unit tests pass a fake). */
export interface BootWindow {
  readonly location: {
    readonly pathname: string; readonly search: string; readonly hash: string; readonly origin: string; readonly hostname: string
    reload(): void; assign(url: string): void
  }
  readonly history: { scrollRestoration: string; pushState(d: unknown, u: string, url: string): void; replaceState(d: unknown, u: string, url: string): void }
  readonly URL: typeof URL
  readonly navigator: { readonly onLine: boolean }
  readonly document: {
    title: string
    querySelector(sel: string): unknown
    documentElement: { dataset: { theme?: string }; style: { colorScheme: string } }
    addEventListener(type: string, fn: (e: any) => void): void
    removeEventListener(type: string, fn: (e: any) => void): void
  }
  readonly localStorage: Storage
  readonly sessionStorage: Storage
  fetch: typeof fetch
  addEventListener(type: string, fn: (e: any) => void): void
  removeEventListener(type: string, fn: (e: any) => void): void
}

/** Injectable boot dependencies; every one defaults to the real `win` member. */
export interface BootDeps {
  storage?: Storage
  sessionStorage?: Storage
  fetch?: typeof fetch
  globals?: GlobalLike
}

export interface ConnectionSettings {
  mode: StorageMode
  apiBaseUrl: string
  defaultApiBaseUrl: string
  onApply(mode: StorageMode, url: string): void
}

/** Everything <oyl-app> needs to wire the shell. */
export interface App {
  win: BootWindow
  storage: Storage
  mode: StorageMode
  apiBase: string
  apiDefault: string
  tz: string
  routeState: ReturnType<typeof createRouteState>
  authState: ReturnType<typeof createAuthState>
  noticeState: ReturnType<typeof createNoticeState>
  themeState: ThemeState
  dataState: ReturnType<typeof createDataState>
  profileStore: ReturnType<typeof createProfileStore>
  googleStore: ReturnType<typeof createGoogleStore>
  googleLoginHref: Signal<{ href: string } | null>
  /** Bumped after every dataState.refresh() so snapshot readers (Status) re-read. */
  refreshTick: Signal<number>
  /** Drain the outbox, then refresh the pending indicator (fire-and-forget). */
  flush(): void
  /** Drain the outbox, then re-pull everything (counts + stores) and bump the tick. */
  flushAndRefresh(): Promise<void>
  connection: ConnectionSettings
  /** After a form login/registration: remote mode + a full navigation into the app. */
  onAuthenticated(): void
}
