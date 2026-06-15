import { factories } from '@strapi/strapi'
import { decideUpsert, toEnvelope, type RecordRow } from '../services/upsert-rule'

const UID = 'api::oyl-record.oyl-record' as const

/** SP2.1 stub — a later slice returns ctx.state.user.id (and requires auth). */
const ownerOf = (_ctx: unknown): number | null => null

export default factories.createCoreController(UID, ({ strapi }) => {
  const docs = () => strapi.documents(UID)
  const findRow = (collection: string, recordId: string) =>
    docs().findFirst({ filters: { collection: { $eq: collection }, recordId: { $eq: recordId } } }) as Promise<(RecordRow & { documentId: string }) | null>

  return {
    async list(ctx: any) {
      const { collection } = ctx.params
      const includeDeleted = ctx.query.includeDeleted === '1'
      const filters: Record<string, unknown> = { collection: { $eq: collection } }
      if (!includeDeleted) filters.deletedAt = { $null: true }
      const rows = (await docs().findMany({ filters })) as unknown as RecordRow[]
      ctx.body = { records: rows.map(toEnvelope) }
    },

    async findOne(ctx: any) {
      const { collection, id } = ctx.params
      const row = await findRow(collection, id)
      if (!row || row.deletedAt) return ctx.notFound()
      ctx.body = toEnvelope(row)
    },

    async upsert(ctx: any) {
      const { collection, id } = ctx.params
      const { data, revision } = (ctx.request.body ?? {}) as { data?: unknown; revision?: number | null }
      const existing = await findRow(collection, id)
      const decision = decideUpsert(existing ? { revision: existing.revision } : undefined, revision ?? null)
      if (decision.action === 'conflict') {
        ctx.status = 409
        ctx.body = { error: { code: 'REVISION_CONFLICT', message: `stale revision for ${collection}/${id}` } }
        return
      }
      const saved =
        decision.action === 'create'
          ? await docs().create({ data: { owner: ownerOf(ctx), collection, recordId: id, data: data as any, revision: 1, deletedAt: null } })
          : await docs().update({ documentId: existing!.documentId, data: { data: data as any, revision: decision.revision, deletedAt: null } })
      ctx.body = toEnvelope(saved as unknown as RecordRow)
    },

    async remove(ctx: any) {
      const { collection, id } = ctx.params
      const existing = await findRow(collection, id)
      if (!existing) { ctx.status = 204; return }
      if (ctx.query.purge === '1') {
        await docs().delete({ documentId: existing.documentId })
      } else if (!existing.deletedAt) {
        await docs().update({ documentId: existing.documentId, data: { deletedAt: new Date(), revision: existing.revision + 1 } })
      }
      ctx.status = 204
    },
  }
})
