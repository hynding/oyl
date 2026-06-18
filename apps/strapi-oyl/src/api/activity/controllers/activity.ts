import { factories } from '@strapi/strapi'

const UID = 'api::activity.activity' as const

export default factories.createCoreController(UID, ({ strapi }) => {
  const query = () => strapi.db.query(UID)

  return {
    async find(ctx: any) {
      const me = ctx.state.user?.id
      if (me == null) return ctx.unauthorized()

      const nameFilter = (ctx.query?.filters as any)?.name?.$containsi as string | undefined

      const where: Record<string, unknown> = {
        $or: [{ visibility: 'public' }, { creator: { id: me } }],
      }
      if (nameFilter != null) {
        where.name = { $containsi: nameFilter }
      }

      const rows = await query().findMany({ where })
      ctx.body = { data: rows }
    },

    async findOne(ctx: any) {
      const me = ctx.state.user?.id
      if (me == null) return ctx.unauthorized()
      const { id } = ctx.params
      const row = await query().findOne({
        where: {
          recordId: String(id),
          $or: [{ visibility: 'public' }, { creator: { id: me } }],
        },
      })
      if (!row) return ctx.notFound()
      ctx.body = { data: row }
    },

    async create(ctx: any) {
      const me = ctx.state.user?.id
      if (me == null) return ctx.unauthorized()
      const { recordId, name, slug, defaultUnit, areaId, visibility } = (ctx.request.body?.data ?? {}) as {
        recordId?: string
        name?: string
        slug?: string
        defaultUnit?: string
        areaId?: string
        visibility?: 'private' | 'public'
      }
      const row = await query().create({
        data: {
          recordId,
          name,
          slug,
          defaultUnit: defaultUnit ?? null,
          areaId: areaId ?? null,
          creator: me,
          visibility: visibility ?? 'public',
        },
      })
      ctx.status = 201
      ctx.body = { data: row }
    },

    // PUT /:id is an upsert keyed by the domain recordId (ctx.params.id). Only the
    // creator can update an existing row; a create of a new recordId is always allowed
    // for the current user. The client never sees Strapi's numeric id.
    async update(ctx: any) {
      const me = ctx.state.user?.id
      if (me == null) return ctx.unauthorized()
      const recordId = String(ctx.params.id)
      const { name, slug, defaultUnit, areaId, visibility } = (ctx.request.body?.data ?? {}) as {
        name?: string
        slug?: string
        defaultUnit?: string
        areaId?: string
        visibility?: 'private' | 'public'
      }
      const existing = await query().findOne({ where: { recordId, creator: { id: me } } })
      if (existing) {
        const row = await query().update({
          where: { id: existing.id, creator: { id: me } },
          data: { name, slug, defaultUnit: defaultUnit ?? null, areaId: areaId ?? null, visibility },
        })
        ctx.body = { data: row }
        return
      }
      // Not ours. If another creator already owns this recordId, refuse (404) — a PUT
      // must never reach across creators. recordId is globally unique, so a create is
      // only safe when the id exists nowhere.
      const claimed = await query().findOne({ where: { recordId } })
      if (claimed) return ctx.notFound()
      const row = await query().create({
        data: {
          recordId,
          name,
          slug,
          defaultUnit: defaultUnit ?? null,
          areaId: areaId ?? null,
          creator: me,
          visibility: visibility ?? 'public',
        },
      })
      ctx.body = { data: row }
    },

    async delete(ctx: any) {
      const me = ctx.state.user?.id
      if (me == null) return ctx.unauthorized()
      const recordId = String(ctx.params.id)
      const existing = await query().findOne({ where: { recordId, creator: { id: me } } })
      if (!existing) return ctx.notFound()
      await query().delete({ where: { id: existing.id, creator: { id: me } } })
      ctx.status = 204
    },
  }
})
