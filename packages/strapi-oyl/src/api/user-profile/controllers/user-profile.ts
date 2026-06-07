// user-profile controller
//
// Owner-scoped via the shared factory. The default `find` is extended to
// populate the profile's nested catalogs (activities, goals, nutrition_items)
// which the frontend expects on the profile read.
//
// Note on `super` resolution: when an extend function returns methods via an
// object literal, those methods carry their own [[HomeObject]] from the
// literal where they were defined. Strapi's factory calls `setPrototypeOf`
// on the merged userCtrl, not on the extend's literal, so `super.find` from
// inside an extend method resolves to `Object.prototype.find` (undefined) —
// not to the user-scoped factory's find. We therefore inject the owner
// filter directly and walk the live prototype to reach the Strapi base
// controller's find.
//
// See src/utils/README.md for the pattern.

import { errors } from '@strapi/utils'
import {
  assertDocumentOwned,
  createUserScopedController,
  injectOwnerFilter,
} from '../../../utils/user-scoped-controller'
import { isAdmin } from '../../../utils/is-admin'

const UID = 'api::user-profile.user-profile' as const

// Intl.supportedValuesOf is available on Node 18+ but not in this project's TS lib target.
const VALID_TIMEZONES = new Set<string>((Intl as any).supportedValuesOf('timeZone'))

function assertValidTimezone(ctx: any) {
  const tz = ctx.request.body?.data?.timezone
  if (tz != null && !VALID_TIMEZONES.has(tz)) {
    throw new errors.ValidationError(`Invalid IANA timezone: ${tz}`)
  }
}

function requireUser(ctx: any): any {
  if (!ctx.state.user) {
    throw new errors.UnauthorizedError('You must be authenticated')
  }
  return ctx.state.user
}

// `this` inside an extend method is the merged userCtrl whose prototype is
// the Strapi base controller (set by factories.createCoreController). Reach
// it explicitly because `super.<action>` from this extend's literal can't.
type BaseCtrl = { find: Fn; create: Fn; update: Fn }
type Fn = (ctx: any) => Promise<unknown>
function baseOf(self: object): BaseCtrl {
  return Reflect.getPrototypeOf(self) as BaseCtrl
}

export default createUserScopedController(
  UID,
  {},
  () => ({
    async find(ctx: any) {
      const user = requireUser(ctx)
      if (!isAdmin(user)) {
        injectOwnerFilter(ctx, user.id)
      }
      ctx.query = {
        ...ctx.query,
        populate: ['activities', 'goals', 'nutrition_items'],
      }
      return await baseOf(this as object).find.call(this, ctx)
    },
    async create(ctx: any) {
      assertValidTimezone(ctx)
      const user = requireUser(ctx)
      if (!isAdmin(user)) {
        ctx.request.body = ctx.request.body ?? {}
        const data = (ctx.request.body.data = ctx.request.body.data ?? {})
        data.user = user.id
      }
      return await baseOf(this as object).create.call(this, ctx)
    },
    async update(ctx: any) {
      assertValidTimezone(ctx)
      const user = requireUser(ctx)
      if (!isAdmin(user)) {
        await assertDocumentOwned(strapi, UID, ctx.params.id, user.id)
        // Prevent transferring ownership via update — mirror the factory's behavior.
        if (ctx.request.body?.data) {
          ctx.request.body.data.user = user.id
        }
      }
      return await baseOf(this as object).update.call(this, ctx)
    },
  }),
)
