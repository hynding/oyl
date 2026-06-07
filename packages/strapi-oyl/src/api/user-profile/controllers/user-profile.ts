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
import { createUserScopedController, injectOwnerFilter } from '../../../utils/user-scoped-controller'
import { isAdmin } from '../../../utils/is-admin'

// Intl.supportedValuesOf is available on Node 18+ but not in this project's TS lib target.
const VALID_TIMEZONES = new Set<string>((Intl as any).supportedValuesOf('timeZone'))

function assertValidTimezone(ctx: any) {
  const tz = ctx.request.body?.data?.timezone
  if (tz != null && !VALID_TIMEZONES.has(tz)) {
    throw new errors.ValidationError(`Invalid IANA timezone: ${tz}`)
  }
}

export default createUserScopedController(
  'api::user-profile.user-profile',
  {},
  () => ({
    async find(ctx: any) {
      if (!ctx.state.user) {
        throw new errors.UnauthorizedError('You must be authenticated')
      }
      if (!isAdmin(ctx.state.user)) {
        injectOwnerFilter(ctx, ctx.state.user.id)
      }
      ctx.query = {
        ...ctx.query,
        populate: ['activities', 'goals', 'nutrition_items'],
      }
      // `this` here is the merged userCtrl whose prototype is the Strapi
      // base controller (set by factories.createCoreController). Reach it
      // explicitly because `super.find` from this extend's literal can't.
      const baseCtrl = Reflect.getPrototypeOf(this as object) as { find: (ctx: any) => Promise<unknown> }
      return await baseCtrl.find.call(this, ctx)
    },
    async create(ctx: any) {
      assertValidTimezone(ctx)
      // @ts-ignore
      return await super.create(ctx)
    },
    async update(ctx: any) {
      assertValidTimezone(ctx)
      // @ts-ignore
      return await super.update(ctx)
    },
  }),
)
