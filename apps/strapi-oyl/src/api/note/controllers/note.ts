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
      const row = await query().findOne({ where: { id: Number(id), owner: { id: owner } } })
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

    async update(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { id } = ctx.params
      const existing = await query().findOne({ where: { id: Number(id), owner: { id: owner } } })
      if (!existing) return ctx.notFound()
      const { recordId, text, tags, occurredAt, note } = (ctx.request.body?.data ?? {}) as {
        recordId?: string
        text?: string
        tags?: string[]
        occurredAt?: string
        note?: string
      }
      const row = await query().update({
        where: { id: Number(id), owner: { id: owner } },
        data: { recordId, text, tags: tags ?? null, occurredAt, note: note ?? null },
      })
      ctx.body = { data: row }
    },

    async delete(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { id } = ctx.params
      const existing = await query().findOne({ where: { id: Number(id), owner: { id: owner } } })
      if (!existing) return ctx.notFound()
      await query().delete({ where: { id: Number(id), owner: { id: owner } } })
      ctx.status = 204
    },
  }
})
