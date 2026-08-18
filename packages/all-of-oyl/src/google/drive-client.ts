import { utf8Encode } from './utf8.js'
import { DriveError, type AccessTokenProvider, type DriveFetchFn, type DriveFetchResponse, type DriveFile } from './types.js'

const DEFAULT_BASE_URL = 'https://www.googleapis.com'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const FILE_FIELDS = 'id,name,mimeType,size,modifiedTime'

export interface DriveClient {
  ensureFolder(name: string): Promise<string>
  list(folderId: string): Promise<DriveFile[]>
  upload(folderId: string, name: string, mimeType: string, bytes: Uint8Array): Promise<DriveFile>
  update(fileId: string, mimeType: string, bytes: Uint8Array): Promise<void>
  download(fileId: string): Promise<Uint8Array>
  remove(fileId: string): Promise<void>
}

type RawFile = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string }

function toDriveFile(raw: RawFile): DriveFile {
  const file: DriveFile = { id: raw.id, name: raw.name, mimeType: raw.mimeType }
  if (raw.size != null) file.size = Number(raw.size)
  if (raw.modifiedTime != null) file.modifiedTime = raw.modifiedTime
  return file
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const part of parts) { out.set(part, offset); offset += part.length }
  return out
}

export function createDriveClient(opts: { fetch: DriveFetchFn; tokens: AccessTokenProvider; baseUrl?: string }): DriveClient {
  const base = opts.baseUrl ?? DEFAULT_BASE_URL

  async function request(
    path: string,
    init: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array } = {},
    retried = false,
  ): Promise<DriveFetchResponse> {
    const token = await opts.tokens.getAccessToken(retried ? { force: true } : undefined)
    let res: DriveFetchResponse
    try {
      res = await opts.fetch(`${base}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } })
    } catch (cause) {
      throw new DriveError('network', `drive request failed: ${String(cause)}`)
    }
    if (res.status === 401 && !retried) return request(path, init, true)
    if (res.status === 401) throw new DriveError('unauthorized', 'drive token rejected', 401)
    if (res.status === 404) throw new DriveError('not-found', 'drive file not found', 404)
    if (res.status === 429) throw new DriveError('rate-limited', 'drive rate limit', 429)
    if (!res.ok) throw new DriveError('network', `drive error ${res.status}`, res.status)
    return res
  }

  async function list(folderId: string): Promise<DriveFile[]> {
    const files: DriveFile[] = []
    let pageToken: string | undefined
    do {
      const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`).replace(/%20/g, '+')
      const page = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
      const res = await request(`/drive/v3/files?q=${q}&fields=nextPageToken,files(${FILE_FIELDS})&pageSize=100${page}`)
      const body = (await res.json()) as { files?: RawFile[]; nextPageToken?: string }
      for (const raw of body.files ?? []) files.push(toDriveFile(raw))
      pageToken = body.nextPageToken
    } while (pageToken)
    return files
  }

  return {
    list,

    async ensureFolder(name: string): Promise<string> {
      const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and mimeType='${FOLDER_MIME}' and trashed=false`).replace(/%20/g, '+')
      const res = await request(`/drive/v3/files?q=${q}&fields=files(id)`)
      const body = (await res.json()) as { files?: Array<{ id: string }> }
      const existing = body.files?.[0]
      if (existing) return existing.id
      const created = await request('/drive/v3/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
      })
      return ((await created.json()) as { id: string }).id
    },

    async upload(folderId: string, name: string, mimeType: string, bytes: Uint8Array): Promise<DriveFile> {
      const boundary = 'oyl-drive-boundary'
      const meta = JSON.stringify({ name, parents: [folderId] })
      const body = concatBytes([
        utf8Encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
        bytes,
        utf8Encode(`\r\n--${boundary}--`),
      ])
      const res = await request(`/upload/drive/v3/files?uploadType=multipart&fields=${FILE_FIELDS}`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      })
      return toDriveFile((await res.json()) as RawFile)
    },

    async update(fileId: string, mimeType: string, bytes: Uint8Array): Promise<void> {
      await request(`/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': mimeType },
        body: bytes,
      })
    },

    async download(fileId: string): Promise<Uint8Array> {
      const res = await request(`/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`)
      return new Uint8Array(await res.arrayBuffer())
    },

    async remove(fileId: string): Promise<void> {
      await request(`/drive/v3/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' })
    },
  }
}
