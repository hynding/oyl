import { factories } from '@strapi/strapi'
import { decideUpsert, toEnvelope, type RecordRow } from '../services/upsert-rule'

const UID = 'api::oyl-record.oyl-record' as const
type Row = RecordRow & { id: number }

export default factories.createCoreController(UID, ({ strapi }) => {
  const query = () => strapi.db.query(UID)
  const findRow = (owner: number, collection: string, recordId: string) =>
    query().findOne({ where: { owner: { id: owner }, collection, recordId } }) as Promise<Row | null>

  return {
    async list(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { collection } = ctx.params
      const where: Record<string, unknown> = { owner: { id: owner }, collection }
      if (ctx.query.includeDeleted !== '1') where.deletedAt = null
      const rows = (await query().findMany({ where })) as unknown as RecordRow[]
      ctx.body = { records: rows.map(toEnvelope) }
    },

    async findOne(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { collection, id } = ctx.params
      const row = await findRow(owner, collection, id)
      if (!row || row.deletedAt) return ctx.notFound()
      ctx.body = toEnvelope(row)
    },

    async upsert(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { collection, id } = ctx.params
      const { data, revision } = (ctx.request.body ?? {}) as { data?: unknown; revision?: number | null }
      const existing = await findRow(owner, collection, id)
      const decision = decideUpsert(existing ? { revision: existing.revision } : undefined, revision ?? null)
      if (decision.action === 'conflict') {
        ctx.status = 409
        ctx.body = { error: { code: 'REVISION_CONFLICT', message: `stale revision for ${collection}/${id}` } }
        return
      }
      const saved =
        decision.action === 'create'
          ? await query().create({ data: { owner: owner, collection, recordId: id, data: data as any, revision: 1, deletedAt: null } })
          : await query().update({ where: { id: existing!.id }, data: { data: data as any, revision: decision.revision, deletedAt: null } })
      ctx.body = toEnvelope(saved as unknown as RecordRow)
    },

    async remove(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { collection, id } = ctx.params
      const existing = await findRow(owner, collection, id)
      if (!existing) { ctx.status = 204; return }
      if (ctx.query.purge === '1') {
        await query().delete({ where: { id: existing.id } })
      } else if (!existing.deletedAt) {
        await query().update({ where: { id: existing.id }, data: { deletedAt: new Date(), revision: existing.revision + 1 } })
      }
      ctx.status = 204
    },
  }
})
