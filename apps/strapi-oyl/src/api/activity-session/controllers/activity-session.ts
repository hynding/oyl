import { factories } from '@strapi/strapi'

const UID = 'api::activity-session.activity-session' as const

/**
 * Strip top-level null scalars so domain decoders receive `undefined` for
 * absent optional fields. `parseEntryBase` expects `note === undefined ||
 * typeof note === 'string'` and throws on `null`. Also strips `quantities:
 * null` so ActivitySession.fromJSON sees no quantities field (empty array).
 */
function stripNulls(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (v !== null) out[k] = v
  }
  return out
}

const QUANTITIES_POPULATE = { quantities: true } as const

export default factories.createCoreController(UID, ({ strapi }: any) => {
  /** Low-level db.query for keyed lookups (recordId → documentId). */
  const dbQuery = () => strapi.db.query(UID)
  /** Document service for full CRUD including component read/write. */
  const docs = () => strapi.documents(UID)

  return {
    async find(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const rows = await docs().findMany({
        filters: { owner: { id: owner } },
        populate: QUANTITIES_POPULATE,
      })
      ctx.body = { data: rows.map((r: any) => stripNulls(r as Record<string, unknown>)) }
    },

    async findOne(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { id } = ctx.params
      const rows = await docs().findMany({
        filters: { recordId: String(id), owner: { id: owner } },
        populate: QUANTITIES_POPULATE,
      })
      if (!rows || rows.length === 0) return ctx.notFound()
      ctx.body = { data: stripNulls(rows[0] as Record<string, unknown>) }
    },

    async create(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { recordId, occurredAt, note, activityId, slug, quantities } =
        (ctx.request.body?.data ?? {}) as {
          recordId?: string
          occurredAt?: string
          note?: string
          activityId?: string
          slug?: string
          quantities?: { amount: number; unit: string }[]
        }
      const row = await docs().create({
        data: {
          recordId,
          occurredAt,
          note: note ?? null,
          activityId: activityId ?? null,
          slug: slug ?? null,
          ...(quantities !== undefined ? { quantities } : {}),
          owner,
        },
        populate: QUANTITIES_POPULATE,
      })
      ctx.status = 201
      ctx.body = { data: stripNulls(row as unknown as Record<string, unknown>) }
    },

    // PUT /:id is an upsert keyed by the domain recordId (ctx.params.id). The client
    // only knows the domain id; it never sees Strapi's numeric id.
    async update(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const recordId = String(ctx.params.id)
      const { occurredAt, note, activityId, slug, quantities } =
        (ctx.request.body?.data ?? {}) as {
          occurredAt?: string
          note?: string
          activityId?: string
          slug?: string
          quantities?: { amount: number; unit: string }[]
        }

      const existing = await dbQuery().findOne({ where: { recordId, owner: { id: owner } } })
      if (existing) {
        const row = await docs().update({
          documentId: (existing as any).documentId,
          data: {
            occurredAt,
            note: note ?? null,
            activityId: activityId ?? null,
            slug: slug ?? null,
            ...(quantities !== undefined ? { quantities } : {}),
          },
          populate: QUANTITIES_POPULATE,
        })
        ctx.body = { data: stripNulls(row as unknown as Record<string, unknown>) }
        return
      }
      // Not ours. If the recordId is already owned by someone else, refuse (404) — a
      // PUT must never reach across owners. recordId is globally unique, so a create
      // here is only safe when the id exists nowhere.
      const claimed = await dbQuery().findOne({ where: { recordId } })
      if (claimed) return ctx.notFound()
      const row = await docs().create({
        data: {
          recordId,
          occurredAt,
          note: note ?? null,
          activityId: activityId ?? null,
          slug: slug ?? null,
          ...(quantities !== undefined ? { quantities } : {}),
          owner,
        },
        populate: QUANTITIES_POPULATE,
      })
      ctx.body = { data: stripNulls(row as unknown as Record<string, unknown>) }
    },

    async delete(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const recordId = String(ctx.params.id)
      const existing = await dbQuery().findOne({ where: { recordId, owner: { id: owner } } })
      if (!existing) return ctx.notFound()
      await docs().delete({ documentId: (existing as any).documentId })
      ctx.status = 204
    },
  }
})
