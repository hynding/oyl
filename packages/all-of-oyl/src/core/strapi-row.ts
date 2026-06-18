/**
 * Read-only adapter: maps a raw Strapi REST row onto the domain shape its codec's
 * `fromJSON` expects. Strapi's relational controllers return their own numeric `id`,
 * the domain id under `recordId`, plus Strapi-internal bookkeeping (`documentId`,
 * `createdAt`/`updatedAt`/`publishedAt`, and the `owner`/`creator` relations). Domain
 * codecs require `id` to be the domain id (a string) and — for Entry-derived types —
 * a `kind` discriminant that Strapi rows don't carry.
 *
 * This is decode-only: the write path PUTs by domain id and the backend upserts by
 * `recordId`, so no inverse mapping is needed. Pure + DOM-free.
 */

/**
 * Strapi-internal keys that must never reach a domain codec (the numeric `id` fails
 * `Id.of`; the rest would pollute the codec's tolerant `extra` round-trip). Stripped
 * only when the row is recognized as a Strapi relational row (i.e. carries `recordId`).
 */
const STRAPI_INTERNAL_KEYS = new Set([
  'id',
  'documentId',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'owner',
  'creator',
  'recordId',
])

/**
 * Convert a raw Strapi row into a plain object a domain codec's `fromJSON` accepts:
 * - the domain `id` is taken from `recordId`,
 * - Strapi-internal keys are stripped (numeric `id`, `documentId`, timestamps, relations),
 * - `opts.kind` is injected when given (for the heterogeneous `entries` reviver),
 * - any other (domain) fields pass through unchanged.
 *
 * Tolerant: a row WITHOUT `recordId` isn't a Strapi relational row, so it passes through
 * untouched (only `kind` injection still applies). Non-object input is returned unchanged
 * so the codec can raise its own MALFORMED_JSON.
 */
export function strapiRowToShape(row: unknown, opts?: { kind?: string }): unknown {
  if (typeof row !== 'object' || row === null) return row
  const source = row as Record<string, unknown>
  const isStrapiRow = 'recordId' in source
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (isStrapiRow && STRAPI_INTERNAL_KEYS.has(key)) continue
    out[key] = value
  }
  if (isStrapiRow) out.id = source.recordId
  if (opts?.kind !== undefined) out.kind = opts.kind
  return out
}
