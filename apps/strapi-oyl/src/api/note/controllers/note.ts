import { factories } from '@strapi/strapi'

const UID = 'api::note.note' as const

export default factories.createCoreController(UID, ({ strapi }) => {
  const query = () => strapi.db.query(UID)

  return {
    async find(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const rows = await query().findMany({ where: { owner: { id: owner } } })
      ctx.body = { data: rows }
    },

    async findOne(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { id } = ctx.params
      const row = await query().findOne({ where: { recordId: String(id), owner: { id: owner } } })
      if (!row) return ctx.notFound()
      ctx.body = { data: row }
    },

    async create(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { recordId, text, tags, occurredAt, note } = (ctx.request.body?.data ?? {}) as {
        recordId?: string
        text?: string
        tags?: string[]
        occurredAt?: string
        note?: string
      }
      const row = await query().create({
        data: { recordId, text, tags: tags ?? null, occurredAt, note: note ?? null, owner },
      })
      ctx.status = 201
      ctx.body = { data: row }
    },

    // PUT /:id is an upsert keyed by the domain recordId (ctx.params.id). The client
    // only knows the domain id; it never sees Strapi's numeric id.
    async update(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const recordId = String(ctx.params.id)
      const { text, tags, occurredAt, note } = (ctx.request.body?.data ?? {}) as {
        text?: string
        tags?: string[]
        occurredAt?: string
        note?: string
      }
      const existing = await query().findOne({ where: { recordId, owner: { id: owner } } })
      if (existing) {
        const row = await query().update({
          where: { id: existing.id, owner: { id: owner } },
          data: { text, tags: tags ?? null, occurredAt, note: note ?? null },
        })
        ctx.body = { data: row }
        return
      }
      // Not ours. If the recordId is already owned by someone else, refuse (404) — a
      // PUT must never reach across owners. recordId is globally unique, so a create
      // here is only safe when the id exists nowhere.
      const claimed = await query().findOne({ where: { recordId } })
      if (claimed) return ctx.notFound()
      const row = await query().create({
        data: { recordId, text, tags: tags ?? null, occurredAt, note: note ?? null, owner },
      })
      ctx.body = { data: row }
    },

    async delete(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const recordId = String(ctx.params.id)
      const existing = await query().findOne({ where: { recordId, owner: { id: owner } } })
      if (!existing) return ctx.notFound()
      await query().delete({ where: { id: existing.id, owner: { id: owner } } })
      ctx.status = 204
    },
  }
})
