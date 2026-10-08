// Minimal structural slices of browser globals the client layer needs. The browser build has
// no DOM lib, so these are the ONLY way browser APIs reach client/. `window` satisfies the
// window-shaped ports structurally; tests pass fakes (see *-fake.ts).
import type { StorageLike } from '../core/local-storage-repository.js'

export type { StorageLike } from '../core/local-storage-repository.js'
export type { FetchFn, FetchResponse } from '../core/http-repository.js'

/** localStorage as the client layer uses it (schema inspection enumerates keys). */
export interface EnumerableStorage extends StorageLike {
  removeItem(key: string): void
  key(index: number): string | null
  readonly length: number
}

export interface EventTargetLike {
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

export interface LocationLike {
  readonly pathname: string
  readonly search: string
  readonly hash: string
  readonly origin: string
}

export interface HistoryLike {
  pushState(data: unknown, unused: string, url: string): void
  replaceState(data: unknown, unused: string, url: string): void
  scrollRestoration?: string
}

/** The `URL` constructor slice route state needs (browsers expose it as `window.URL`). */
export type UrlCtor = new (url: string, base?: string) => { readonly pathname: string, readonly search: string }

/** What History-API route state needs from `window`. */
export interface RouteWindow extends EventTargetLike {
  readonly location: LocationLike
  readonly history: HistoryLike
  readonly URL: UrlCtor
}

/** What browser connectivity needs from `window`. */
export interface ConnectivityWindow extends EventTargetLike {
  readonly navigator: { readonly onLine: boolean }
}

export interface LockManagerLike {
  request(name: string, fn: () => Promise<void>): Promise<unknown>
}

/** What the cross-tab lock needs from `window` (Web Locks are optional). */
export interface LockWindow {
  readonly navigator: { readonly locks?: LockManagerLike }
}

export interface StorageEstimate { usage: number, quota: number }
/** Best-effort storage quota probe (navigator.storage.estimate in browsers). */
export type StorageEstimator = () => Promise<StorageEstimate | null>
