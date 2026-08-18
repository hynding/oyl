/** A file in the app's Drive folder (drive.file scope: only files this app created are visible). */
export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: number
  modifiedTime?: string
}

/**
 * The seam between the Drive client and its token source (browser google-store now,
 * ocari CLI later). `force: true` means "the last token was rejected — bypass any
 * cache and mint a fresh one".
 */
export interface AccessTokenProvider {
  getAccessToken(opts?: { force?: boolean }): Promise<string>
}

/** Fetch slice for Drive: adds arrayBuffer() (downloads) and binary bodies to the FetchFn idea. */
export interface DriveFetchResponse {
  readonly status: number
  readonly ok: boolean
  json(): Promise<unknown>
  arrayBuffer(): Promise<ArrayBuffer>
}
export type DriveFetchFn = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array },
) => Promise<DriveFetchResponse>

/** Typed Drive failures, mirroring HttpRepositoryError's discriminated kinds. */
export class DriveError extends Error {
  readonly kind: 'unauthorized' | 'not-found' | 'rate-limited' | 'network'
  readonly status: number | undefined
  constructor(kind: 'unauthorized' | 'not-found' | 'rate-limited' | 'network', message: string, status?: number) {
    super(message)
    this.name = 'DriveError'
    this.kind = kind
    this.status = status
  }
}
