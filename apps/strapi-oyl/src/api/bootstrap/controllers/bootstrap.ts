import type { Core } from '@strapi/strapi'
import { AMOUNT_POPULATE, LIMIT_POPULATE, sanitizeMoneyRow } from '../../../utils/finance-money'
import { FACTS_POPULATE, NUTRIENTS_POPULATE, sanitizeFacts, sanitizeConsumptionRow, sanitizeProductRow } from '../../../utils/nutrition-facts'
import { stripNulls } from '../../../utils/strip-nulls'

// Strapi injects the running instance as a global in controllers.
declare const strapi: Core.Strapi

type Row = Record<string, unknown>
type Sanitize = (row: Row) => Row
/** populate/sanitize MUST mirror the collection's own controller so rows decode identically. */
type Spec = { key: string; uid: string; populate?: Record<string, unknown>; sanitize?: Sanitize }

const identity: Sanitize = (r) => r

/**
 * Aggregate boot read. Scoping mirrors the per-collection controllers exactly:
 * personal rows are owner-only; catalog rows are public-or-mine. Keys are the REST
 * plural paths so the client can route rows by its collection→path map. Component
 * fields (money/facts/quantities) are populated and sanitized exactly like each
 * collection's own find() — otherwise rows decode differently depending on which
 * read path fetched them (the client hydrates every store from this one payload).
 */
const PERSONAL: Spec[] = [
  { key: 'notes', uid: 'api::note.note' },
  { key: 'consumptions', uid: 'api::consumption.consumption', populate: NUTRIENTS_POPULATE, sanitize: sanitizeConsumptionRow },
  { key: 'transactions', uid: 'api::transaction.transaction', populate: AMOUNT_POPULATE, sanitize: (r) => sanitizeMoneyRow(r, 'amount') },
  { key: 'measurements', uid: 'api::measurement.measurement', sanitize: stripNulls },
  { key: 'activity-sessions', uid: 'api::activity-session.activity-session', populate: { quantities: true }, sanitize: stripNulls },
  { key: 'accounts', uid: 'api::account.account' },
  { key: 'budgets', uid: 'api::budget.budget', populate: LIMIT_POPULATE, sanitize: (r) => sanitizeMoneyRow(r, 'limit') },
  { key: 'goals', uid: 'api::goal.goal', sanitize: stripNulls },
]

const CATALOG: Spec[] = [
  { key: 'activities', uid: 'api::activity.activity' },
  { key: 'consumables', uid: 'api::consumable.consumable', populate: FACTS_POPULATE, sanitize: (r) => sanitizeFacts(r) },
  { key: 'consumable-products', uid: 'api::consumable-product.consumable-product', populate: FACTS_POPULATE, sanitize: sanitizeProductRow },
]

export default {
  async find(ctx: any) {
    const me = ctx.state.user?.id
    if (me == null) return ctx.unauthorized()

    const data: Record<string, unknown[]> = {}
    const query = (spec: Spec, filters: Record<string, unknown>) =>
      (strapi.documents(spec.uid as any) as any)
        .findMany({ filters, ...(spec.populate ? { populate: spec.populate } : {}) })
        .then((rows: unknown[]) => {
          data[spec.key] = (rows as Row[]).map(spec.sanitize ?? identity)
        })

    await Promise.all([
      ...PERSONAL.map((spec) => query(spec, { owner: { id: me } })),
      ...CATALOG.map((spec) => query(spec, { $or: [{ visibility: 'public' }, { creator: { id: me } }] })),
    ])
    ctx.body = { data, meta: {} }
  },
}
