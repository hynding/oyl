/** Minimal slice of the Fetch API needed by requests; injected for testability. */
export interface FetchResponse {
  readonly status: number
  readonly ok: boolean
  json(): Promise<unknown>
}

/** Minimal fetch function signature; injected for testability and to avoid a DOM-lib dependency. */
export type FetchFn = (url: string, init?: Record<string, unknown>) => Promise<FetchResponse>

/** Non-domain HTTP failures, discriminated so callers can react (auth → re-login, transport → retry). */
export class HttpRepositoryError extends Error {
  readonly kind: 'auth' | 'transport' | 'server'
  readonly status: number | undefined
  constructor(kind: 'auth' | 'transport' | 'server', message: string, status?: number) {
    super(message)
    this.name = 'HttpRepositoryError'
    this.kind = kind
    this.status = status
  }
}
