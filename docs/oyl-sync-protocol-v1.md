# OYL Sync Protocol v1

## Intent

This document is the HTTP contract any OYL backend implements so the `@oyl/all-of-oyl` `HttpRepository` can talk to it. A backend is conformant iff it passes the exported `httpProtocolContract` suite.

---

## Authentication

Every request carries `Authorization: Bearer <token>`. The server resolves the **owner** from that token and scopes all records to that owner. The client never sends an explicit owner field.

---

## Record Envelope

All responses return records as JSON objects of this shape:

```json
{
  "id": "string (UUID)",
  "data": "<opaque codec JSON>",
  "revision": 1,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "deletedAt": "ISO-8601 | null"
}
```

The `data` field is opaque to the server — it stores and returns it verbatim. Only the `@oyl/all-of-oyl` codec layer interprets it.

---

## Endpoints

Base URL: `{baseUrl}/v1`. `{c}` = collection slug, `{id}` = record UUID.

| Method | Path | Query | Request body | Success response |
|---|---|---|---|---|
| `GET` | `/v1/{c}` | `?includeDeleted=1` | — | `200 { "records": Envelope[] }` |
| `GET` | `/v1/{c}/{id}` | — | — | `200 Envelope` or `404` |
| `PUT` | `/v1/{c}/{id}` | — | `{ "data": any, "revision": number \| null }` | `200 Envelope` |
| `POST` | `/v1/{c}:batch` | — | `{ "items": [{ "id", "data", "revision" }] }` | `200 { "records": Envelope[] }` |
| `DELETE` | `/v1/{c}/{id}` | `?purge=1` | — | `204` |

**GET `/v1/{c}`** excludes records where `deletedAt != null` unless `?includeDeleted=1` is present.

**PUT `/v1/{c}/{id}`** is an upsert (see Concurrency below).

**POST `/v1/{c}:batch`** is atomic — all items succeed or none are committed (all-or-nothing).

**DELETE `/v1/{c}/{id}`** performs a soft tombstone (sets `deletedAt`). `?purge=1` performs a hard delete. The operation is idempotent.

---

## Upsert / Concurrency Rule

**No existing record** for `{id}`:
- Create with `revision = 1`, `createdAt = updatedAt = now`.
- Any `revision` value in the request body is ignored.

**Existing record** for `{id}`:
- Require `body.revision === stored.revision`; if they differ respond `409 REVISION_CONFLICT`.
- On match: store `data`, set `revision = stored.revision + 1`, set `updatedAt = now`.

---

## Error Responses

All errors respond with JSON:

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "human-readable description"
  }
}
```

| Status | Meaning |
|---|---|
| `401` | Unauthenticated (missing or invalid token) |
| `403` | Forbidden (token valid but lacks access) |
| `404` | Record not found |
| `409` | `REVISION_CONFLICT` — optimistic concurrency mismatch |
| `413` | Payload too large (server SHOULD cap `data` size) |
| `422` | Malformed request body |
| `5xx` | Server error |

---

## Notes for Implementers

- **Pagination:** `list` (`GET /v1/{c}`) is intentionally unpaginated in v1. A `?cursor=` / `?limit=` extension is backward-compatible future work; clients that omit these params must keep working.
- **Data size cap:** The server SHOULD enforce a maximum size on the `data` field and respond `413` if exceeded.
- **Idempotency-Key header:** The `Idempotency-Key` request header is reserved but unused in v1; it is intended for future retry-deduplication.
- **OpenAPI:** An OpenAPI description of these endpoints is a welcome later addition but is not required for conformance.

---

## Conformance Testing

Run the exported contract suite against a running, per-test-reset backend instance:

```ts
import { httpProtocolContract } from '@oyl/all-of-oyl/http-repository-contract'

httpProtocolContract('my-backend', () => ({
  baseUrl: 'http://localhost:PORT',
  fetch: globalThis.fetch,
  getToken: () => 'test-token',
}))
```

All Repository contract cases must pass. The suite is the normative definition of conformance — this document describes intent; the tests enforce it.
