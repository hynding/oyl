import { factories } from '@strapi/strapi'

const UID = 'api::consumable.consumable' as const

export default factories.createCoreController(UID, ({ strapi }) => {
  /** Low-level db.query for fast keyed lookups (no component populate needed). */
  const dbQuery = () => strapi.db.query(UID)
  /** Document service for full CRUD including component read/write. */
  const docs = () => strapi.documents(UID)

  /** Populate spec passed to strapi.documents() calls so facts (+ nested servingSize/additional) are returned. */
  const POPULATE = { facts: { populate: { servingSize: true, additional: true } } } as const

  /**
   * Strip null values from a facts component object so domain decoders
   * (nutritionFactsFromJSON) receive `undefined` for absent fields rather than `null`.
   * Strapi stores unset decimal component columns as NULL and returns them.
   */
  function sanitizeFacts(row: Record<string, unknown>): Record<string, unknown> {
    if (row['facts'] == null) return row
    const rawFacts = row['facts'] as Record<string, unknown>
    const cleanFacts: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rawFacts)) {
      if (v === null) continue
      if (k === 'servingSize' && typeof v === 'object') {
        // servingSize component: strip nulls from nested object
        const ss = v as Record<string, unknown>
        const cleanSs: Record<string, unknown> = {}
        for (const [sk, sv] of Object.entries(ss)) {
          if (sv !== null) cleanSs[sk] = sv
        }
        cleanFacts[k] = cleanSs
      } else if (k === 'additional' && Array.isArray(v)) {
        // additional: strip nulls from each item
        cleanFacts[k] = (v as Array<Record<string, unknown>>).map((item) => {
          const clean: Record<string, unknown> = {}
          for (const [ik, iv] of Object.entries(item)) {
            if (iv !== null) clean[ik] = iv
          }
          return clean
        })
      } else {
        cleanFacts[k] = v
      }
    }
    return { ...row, facts: cleanFacts }
  }

  return {
    async find(ctx: any) {
      const me = ctx.state.user?.id
      if (me == null) return ctx.unauthorized()

      const nameFilter = (ctx.query?.filters as any)?.name?.$containsi as string | undefined

      const filters: Record<string, unknown> = {
        $or: [{ visibility: 'public' }, { creator: { id: me } }],
      }
      if (nameFilter != null) {
        filters.name = { $containsi: nameFilter }
      }

      const rows = await docs().findMany({ filters, populate: POPULATE })
      ctx.body = { data: rows.map((r: any) => sanitizeFacts(r as Record<string, unknown>)) }
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
        populate: POPULATE,
      })
      if (!rows || rows.length === 0) return ctx.notFound()
      ctx.body = { data: sanitizeFacts(rows[0] as Record<string, unknown>) }
    },

    async create(ctx: any) {
      const me = ctx.state.user?.id
      if (me == null) return ctx.unauthorized()
      const { recordId, name, slug, facts, ingredients, allergens, visibility } = (ctx.request.body?.data ?? {}) as {
        recordId?: string
        name?: string
        slug?: string
        facts?: Record<string, unknown>
        ingredients?: string[]
        allergens?: string[]
        visibility?: 'private' | 'public'
      }
      const row = await docs().create({
        data: {
          recordId,
          name,
          slug,
          facts: facts ?? null,
          ingredients: ingredients ?? null,
          allergens: allergens ?? null,
          creator: me,
          visibility: visibility ?? 'public',
        },
        populate: POPULATE,
      })
      ctx.status = 201
      ctx.body = { data: sanitizeFacts(row as unknown as Record<string, unknown>) }
    },

    // PUT /:id is an upsert keyed by the domain recordId (ctx.params.id). Only the
    // creator can update an existing row; a create of a new recordId is always allowed
    // for the current user. The client never sees Strapi's numeric id.
    async update(ctx: any) {
      const me = ctx.state.user?.id
      if (me == null) return ctx.unauthorized()
      const recordId = String(ctx.params.id)
      const { name, slug, facts, ingredients, allergens, visibility } = (ctx.request.body?.data ?? {}) as {
        name?: string
        slug?: string
        facts?: Record<string, unknown>
        ingredients?: string[]
        allergens?: string[]
        visibility?: 'private' | 'public'
      }

      // Look up by recordId for this creator
      const existing = await dbQuery().findOne({ where: { recordId, creator: { id: me } } })
      if (existing) {
        const row = await docs().update({
          documentId: (existing as any).documentId,
          data: {
            name,
            slug,
            facts: facts ?? null,
            ingredients: ingredients ?? null,
            allergens: allergens ?? null,
            visibility,
          },
          populate: POPULATE,
        })
        ctx.body = { data: sanitizeFacts(row as unknown as Record<string, unknown>) }
        return
      }
      // Not ours. If another creator already owns this recordId, refuse (404) — a PUT
      // must never reach across creators. recordId is globally unique, so a create is
      // only safe when the id exists nowhere.
      const claimed = await dbQuery().findOne({ where: { recordId } })
      if (claimed) return ctx.notFound()
      const row = await docs().create({
        data: {
          recordId,
          name,
          slug,
          facts: facts ?? null,
          ingredients: ingredients ?? null,
          allergens: allergens ?? null,
          creator: me,
          visibility: visibility ?? 'public',
        },
        populate: POPULATE,
      })
      ctx.body = { data: sanitizeFacts(row as unknown as Record<string, unknown>) }
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
