/**
 * nutrition-item controller — on create, dedup by barcode; force creator.
 */
import { factories } from '@strapi/strapi'

const UID = 'api::nutrition-item.nutrition-item' as const

export default factories.createCoreController(UID, ({ strapi }) => ({
  async create(ctx: any) {
    const user = ctx.state.user
    if (!user) return ctx.unauthorized('You are not logged in')
    const data = ctx.request.body?.data ?? {}
    const barcode = typeof data.barcode === 'string' && data.barcode.length > 0 ? data.barcode : null
    if (barcode) {
      const existing = await strapi.documents(UID).findFirst({ filters: { barcode: { $eq: barcode } } })
      if (existing) return existing
    }
    return await strapi.documents(UID).create({
      data: { ...data, creator: user.id },
    })
  },
}))
