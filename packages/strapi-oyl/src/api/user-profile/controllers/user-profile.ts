// user-profile controller
//
// Owner-scoped via the shared factory. The default `find` is extended to
// populate the profile's nested catalogs (activities, goals, nutrition_items)
// which the frontend expects on the profile read. `create`/`update` add
// IANA-timezone validation but otherwise delegate to the scoped actions.
//
// See src/utils/README.md for the extend pattern.

import { errors } from '@strapi/utils'
import { createUserScopedController } from '../../../utils/user-scoped-controller'

// `Intl.supportedValuesOf('timeZone')` only returns canonical IANA names —
// common aliases (UTC, GMT, US/Pacific) are excluded even though
// Intl.DateTimeFormat accepts them. Construct a DateTimeFormat to delegate
// the check to the runtime's full timezone database, alias resolution
// included.
function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function assertValidTimezone(ctx: any) {
  const tz = ctx.request.body?.data?.timezone
  if (tz != null && !isValidTimezone(tz)) {
    throw new errors.ValidationError(`Invalid IANA timezone: ${tz}`)
  }
}

export default createUserScopedController(
  'api::user-profile.user-profile',
  {},
  ({ scoped }) => ({
    async find(ctx: any) {
      ctx.query = {
        ...ctx.query,
        populate: ['activities', 'goals', 'nutrition_items'],
      }
      return await scoped.find(ctx)
    },
    async create(ctx: any) {
      assertValidTimezone(ctx)
      return await scoped.create(ctx)
    },
    async update(ctx: any) {
      assertValidTimezone(ctx)
      return await scoped.update(ctx)
    },
  }),
)
