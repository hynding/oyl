import { factories } from '@strapi/strapi'
import { FACTS_POPULATE, sanitizeProductRow } from '../../../utils/nutrition-facts'

const UID = 'api::consumable-product.consumable-product' as const

export default factories.createCoreController(UID, ({ strapi }: any) => {
  /** Low-level db.query for fast keyed lookups (no component populate needed). */
  const dbQuery = () => strapi.db.query(UID)
  /** Document service for full CRUD including component read/write. */
  const docs = () => strapi.documents(UID)

  return {
    async find(ctx: any) {
      const me = ctx.state.user?.id
      if (me == null) return ctx.unauthorized()

      const rows = await docs().findMany({
        filters: { $or: [{ visibility: 'public' }, { creator: { id: me } }] },
        populate: FACTS_POPULATE,
      })
      ctx.body = { data: rows.map((r: any) => sanitizeProductRow(r as Record<string, unknown>)) }
    },

    async findOne(ctx: any) {
      const me = ctx.state.user?.id
      if (me == null) return ctx.unauthorized()
      const { id } = ctx.params

      const rows = await docs().findMany({
        filters: {
          recordId: String(id),
          $or: [{ visibility: 'public' }, { creator: { id: me } }],
        },
        populate: FACTS_POPULATE,
      })
      if (!rows || rows.length === 0) return ctx.notFound()
      ctx.body = { data: sanitizeProductRow(rows[0] as Record<string, unknown>) }
    },

    // POST creates a product. UPC-dedup: if a UPC is provided and a row already
    // exists with that UPC, return the existing row (one shared global row).
    // UPC products are always public; non-UPC products are private by default.
    async create(ctx: any) {
      const me = ctx.state.user?.id
      if (me == null) return ctx.unauthorized()
      const {
        recordId,
        name,
        consumableId,
        upc,
        brand,
        netWeight,
        servingsPerContainer,
        facts,
        ingredients,
        allergens,
        visibility,
      } = (ctx.request.body?.data ?? {}) as {
        recordId?: string
        name?: string
        consumableId?: string
        upc?: string
        brand?: string
        netWeight?: Record<string, unknown>
        servingsPerContainer?: number
        facts?: Record<string, unknown>
        ingredients?: string[]
        allergens?: string[]
        visibility?: 'private' | 'public'
      }

      // UPC dedup: if a row with this UPC already exists, return it
      if (upc != null) {
        const existing = await dbQuery().findOne({ where: { upc } })
        if (existing) {
          const rows = await docs().findMany({
            filters: { upc },
            populate: FACTS_POPULATE,
          })
          if (rows && rows.length > 0) {
            ctx.status = 200
            ctx.body = { data: sanitizeProductRow(rows[0] as Record<string, unknown>) }
            return
          }
        }
      }

      const row = await docs().create({
        data: {
          recordId,
          name,
          consumableId: consumableId ?? null,
          upc: upc ?? null,
          brand: brand ?? null,
          netWeight: netWeight ?? null,
          servingsPerContainer: servingsPerContainer ?? null,
          facts: facts ?? null,
          ingredients: ingredients ?? null,
          allergens: allergens ?? null,
          creator: me,
          // UPC products are always public; non-UPC are private by default
          visibility: upc != null ? 'public' : (visibility ?? 'private'),
        },
        populate: FACTS_POPULATE,
      })
      ctx.status = 201
      ctx.body = { data: sanitizeProductRow(row as unknown as Record<string, unknown>) }
    },

    // PUT /:id is an upsert keyed by domain recordId (ctx.params.id).
    // UPC-dedup: if data.upc is present and a row with that UPC already exists,
    // return that existing row (convergence — the client's recordId yields to the shared row).
    // If data.upc absent: activity-style upsert by recordId, creator-scoped.
    async update(ctx: any) {
      const me = ctx.state.user?.id
      if (me == null) return ctx.unauthorized()
      const recordId = String(ctx.params.id)
      const {
        name,
        consumableId,
        upc,
        brand,
        netWeight,
        servingsPerContainer,
        facts,
        ingredients,
        allergens,
        visibility,
      } = (ctx.request.body?.data ?? {}) as {
        name?: string
        consumableId?: string
        upc?: string
        brand?: string
        netWeight?: Record<string, unknown>
        servingsPerContainer?: number
        facts?: Record<string, unknown>
        ingredients?: string[]
        allergens?: string[]
        visibility?: 'private' | 'public'
      }

      if (upc != null) {
        // UPC-dedup: if a row with this UPC exists, return it (convergence)
        const existingByUpc = await dbQuery().findOne({ where: { upc } })
        if (existingByUpc) {
          const rows = await docs().findMany({
            filters: { upc },
            populate: FACTS_POPULATE,
          })
          if (rows && rows.length > 0) {
            ctx.body = { data: sanitizeProductRow(rows[0] as Record<string, unknown>) }
            return
          }
        }
        // No row with this UPC — create it (UPC products are always public)
        const row = await docs().create({
          data: {
            recordId,
            name,
            consumableId: consumableId ?? null,
            upc,
            brand: brand ?? null,
            netWeight: netWeight ?? null,
            servingsPerContainer: servingsPerContainer ?? null,
            facts: facts ?? null,
            ingredients: ingredients ?? null,
            allergens: allergens ?? null,
            creator: me,
            visibility: 'public',
          },
          populate: FACTS_POPULATE,
        })
        ctx.body = { data: sanitizeProductRow(row as unknown as Record<string, unknown>) }
        return
      }

      // No UPC: activity-style upsert by recordId, creator-scoped
      const existing = await dbQuery().findOne({ where: { recordId, creator: { id: me } } })
      if (existing) {
        const row = await docs().update({
          documentId: (existing as any).documentId,
          data: {
            name,
            consumableId: consumableId ?? null,
            brand: brand ?? null,
            netWeight: netWeight ?? null,
            servingsPerContainer: servingsPerContainer ?? null,
            facts: facts ?? null,
            ingredients: ingredients ?? null,
            allergens: allergens ?? null,
            visibility,
          },
          populate: FACTS_POPULATE,
        })
        ctx.body = { data: sanitizeProductRow(row as unknown as Record<string, unknown>) }
        return
      }
      // Not ours. If another creator owns this recordId, refuse (404).
      const claimed = await dbQuery().findOne({ where: { recordId } })
      if (claimed) return ctx.notFound()
      const row = await docs().create({
        data: {
          recordId,
          name,
          consumableId: consumableId ?? null,
          upc: null,
          brand: brand ?? null,
          netWeight: netWeight ?? null,
          servingsPerContainer: servingsPerContainer ?? null,
          facts: facts ?? null,
          ingredients: ingredients ?? null,
          allergens: allergens ?? null,
          creator: me,
          visibility: visibility ?? 'private',
        },
        populate: FACTS_POPULATE,
      })
      ctx.body = { data: sanitizeProductRow(row as unknown as Record<string, unknown>) }
    },

    async delete(ctx: any) {
      const me = ctx.state.user?.id
      if (me == null) return ctx.unauthorized()
      const recordId = String(ctx.params.id)
      const existing = await dbQuery().findOne({ where: { recordId, creator: { id: me } } })
      if (!existing) return ctx.notFound()
      await docs().delete({ documentId: (existing as any).documentId })
      ctx.status = 204
    },
  }
})
