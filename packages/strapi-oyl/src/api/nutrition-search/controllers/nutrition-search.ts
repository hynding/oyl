/**
 * nutrition-search controller — upsert on create.
 */
import { factories } from '@strapi/strapi'

const UID = 'api::nutrition-search.nutrition-search' as const

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ')
}

export default factories.createCoreController(UID, ({ strapi }) => ({
  async create(ctx: any) {
    const raw = ctx.request.body?.data?.query
    if (typeof raw !== 'string') return ctx.badRequest('Missing query')
    const query = normalizeQuery(raw)
    const results = ctx.request.body?.data?.results
    const existing = await strapi.documents(UID).findFirst({ filters: { query: { $eq: query } } })
    if (existing) {
      return await strapi.documents(UID).update({
        documentId: existing.documentId,
        data: { results },
      })
    }
    return await strapi.documents(UID).create({ data: { query, results } })
  },
}))
