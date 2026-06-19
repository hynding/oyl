import { factories } from '@strapi/strapi'
import { stripNulls } from '../../../utils/strip-nulls'

const UID = 'api::goal.goal' as const

export default factories.createCoreController(UID, ({ strapi }) => {
  const query = () => strapi.db.query(UID)

  return {
    async find(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const rows = await query().findMany({ where: { owner: { id: owner } } })
      ctx.body = { data: (rows as Record<string, unknown>[]).map(stripNulls) }
    },

    async findOne(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { id } = ctx.params
      const row = await query().findOne({ where: { recordId: String(id), owner: { id: owner } } })
      if (!row) return ctx.notFound()
      ctx.body = { data: stripNulls(row as Record<string, unknown>) }
    },

    async create(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { recordId, name, metric, target, direction, period, aggregation, emptyPeriods, areaId, pauses } =
        (ctx.request.body?.data ?? {}) as {
          recordId?: string
          name?: string
          metric?: string
          target?: number
          direction?: string
          period?: string
          aggregation?: string
          emptyPeriods?: string
          areaId?: string
          pauses?: unknown
        }
      const row = await query().create({
        data: {
          recordId,
          name: name ?? null,
          metric,
          target,
          direction,
          period,
          aggregation,
          emptyPeriods,
          areaId: areaId ?? null,
          pauses: pauses ?? null,
          owner,
        },
      })
      ctx.status = 201
      ctx.body = { data: stripNulls(row as Record<string, unknown>) }
    },

    // PUT /:id is an upsert keyed by the domain recordId (ctx.params.id). The client
    // only knows the domain id; it never sees Strapi's numeric id.
    async update(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const recordId = String(ctx.params.id)
      const { name, metric, target, direction, period, aggregation, emptyPeriods, areaId, pauses } =
        (ctx.request.body?.data ?? {}) as {
          name?: string
          metric?: string
          target?: number
          direction?: string
          period?: string
          aggregation?: string
          emptyPeriods?: string
          areaId?: string
          pauses?: unknown
        }
      const existing = await query().findOne({ where: { recordId, owner: { id: owner } } })
      if (existing) {
        const row = await query().update({
          where: { id: existing.id, owner: { id: owner } },
          data: {
            name: name ?? null,
            metric,
            target,
            direction,
            period,
            aggregation,
            emptyPeriods,
            areaId: areaId ?? null,
            pauses: pauses ?? null,
          },
        })
        ctx.body = { data: stripNulls(row as Record<string, unknown>) }
        return
      }
      // Not ours. If the recordId is already owned by someone else, refuse (404) — a
      // PUT must never reach across owners. recordId is globally unique, so a create
      // here is only safe when the id exists nowhere.
      const claimed = await query().findOne({ where: { recordId } })
      if (claimed) return ctx.notFound()
      const row = await query().create({
        data: {
          recordId,
          name: name ?? null,
          metric,
          target,
          direction,
          period,
          aggregation,
          emptyPeriods,
          areaId: areaId ?? null,
          pauses: pauses ?? null,
          owner,
        },
      })
      ctx.body = { data: stripNulls(row as Record<string, unknown>) }
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
