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
          id: Number(id),
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

    async update(ctx: any) {
      const me = ctx.state.user?.id
      if (me == null) return ctx.unauthorized()
      const { id } = ctx.params
      const existing = await query().findOne({ where: { id: Number(id), creator: { id: me } } })
      if (!existing) return ctx.notFound()
      const { recordId, name, slug, defaultUnit, areaId, visibility } = (ctx.request.body?.data ?? {}) as {
        recordId?: string
        name?: string
        slug?: string
        defaultUnit?: string
        areaId?: string
        visibility?: 'private' | 'public'
      }
      const row = await query().update({
        where: { id: Number(id), creator: { id: me } },
        data: { recordId, name, slug, defaultUnit: defaultUnit ?? null, areaId: areaId ?? null, visibility },
      })
      ctx.body = { data: row }
    },

    async delete(ctx: any) {
      const me = ctx.state.user?.id
      if (me == null) return ctx.unauthorized()
      const { id } = ctx.params
      const existing = await query().findOne({ where: { id: Number(id), creator: { id: me } } })
      if (!existing) return ctx.notFound()
      await query().delete({ where: { id: Number(id), creator: { id: me } } })
      ctx.status = 204
    },
  }
})
