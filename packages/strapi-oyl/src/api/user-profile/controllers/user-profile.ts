// user-profile controller
//
// Owner-scoped via the shared factory. The default `find` is extended to
// populate the profile's nested catalogs (activities, goals, nutrition_items)
// which the frontend expects on the profile read. The factory's owner filter
// is still applied because we delegate to `super.find`.
//
// See src/utils/README.md for the pattern.

import { errors } from '@strapi/utils'
import { createUserScopedController } from '../../../utils/user-scoped-controller'

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
      ctx.query = {
        ...ctx.query,
        populate: ['activities', 'goals', 'nutrition_items'],
      }
      // @ts-ignore -- super delegates to the factory's owner-scoped find.
      return await super.find(ctx)
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
