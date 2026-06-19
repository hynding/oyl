import { factories } from '@strapi/strapi'
import { LIMIT_POPULATE, sanitizeMoneyRow } from '../../../utils/finance-money'

const UID = 'api::budget.budget' as const

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
        populate: LIMIT_POPULATE,
      })
      ctx.body = { data: rows.map((r: any) => sanitizeMoneyRow(r as Record<string, unknown>, 'limit')) }
    },

    async findOne(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { id } = ctx.params
      const rows = await docs().findMany({
        filters: { recordId: String(id), owner: { id: owner } },
        populate: LIMIT_POPULATE,
      })
      if (!rows || rows.length === 0) return ctx.notFound()
      ctx.body = { data: sanitizeMoneyRow(rows[0] as Record<string, unknown>, 'limit') }
    },

    async create(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { recordId, name, category, limit } =
        (ctx.request.body?.data ?? {}) as {
          recordId?: string
          name?: string
          category?: string
          limit?: Record<string, unknown>
        }
      const row = await docs().create({
        data: {
          recordId,
          name: name ?? null,
          category,
          limit: limit ?? null,
          owner,
        },
        populate: LIMIT_POPULATE,
      })
      ctx.status = 201
      ctx.body = { data: sanitizeMoneyRow(row as unknown as Record<string, unknown>, 'limit') }
    },

    // PUT /:id is an upsert keyed by the domain recordId (ctx.params.id). The client
    // only knows the domain id; it never sees Strapi's numeric id.
    async update(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const recordId = String(ctx.params.id)
      const { name, category, limit } =
        (ctx.request.body?.data ?? {}) as {
          name?: string
          category?: string
          limit?: Record<string, unknown>
        }

      const existing = await dbQuery().findOne({ where: { recordId, owner: { id: owner } } })
      if (existing) {
        const row = await docs().update({
          documentId: (existing as any).documentId,
          data: {
            name: name ?? null,
            category,
            limit: limit ?? null,
          },
          populate: LIMIT_POPULATE,
        })
        ctx.body = { data: sanitizeMoneyRow(row as unknown as Record<string, unknown>, 'limit') }
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
          name: name ?? null,
          category,
          limit: limit ?? null,
          owner,
        },
        populate: LIMIT_POPULATE,
      })
      ctx.body = { data: sanitizeMoneyRow(row as unknown as Record<string, unknown>, 'limit') }
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
