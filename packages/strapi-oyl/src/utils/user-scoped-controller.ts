// Factory that wraps Strapi's core controller with owner-only authorization.
//
// Rules enforced for every non-admin authenticated caller:
//   - find:           list query is filtered to rows owned by the caller
//   - findOne:        404s if the row is not owned by the caller
//   - create:         the owner field is force-set from ctx.state.user.id
//                     (or, for transitive ownership, the parent ref is verified)
//   - update/delete:  the targeted row is verified owned before delegating
//
// See ./README.md for the full pattern and how to add new user-* APIs.

import { factories } from '@strapi/strapi'
import { errors } from '@strapi/utils'
import { isAdmin } from './is-admin'
import { buildOwnerFilter, buildOwnerPopulate, getOwnerIdAtPath } from './ownership'

export type UserScopedOptions = {
  // Dot-path from the entity to the user relation. Defaults to 'user'.
  // For transitive ownership (e.g. user-goal-milestone -> user_goal -> user)
  // pass the full path like 'user_goal.user'.
  ownerPath?: string
  // role.type or role.name values that bypass scoping. Defaults to
  // ['admin', 'Administrator']. Set to [] to disable admin bypass.
  adminRoles?: string[]
}

// The owner-scoped CRUD actions the factory wraps around. These are exposed
// to `extend` so custom controllers can compose around them instead of using
// `super.<action>`, which doesn't survive Strapi's prototype setup when the
// method is defined in the extend's own object literal — see the note in
// `packages/strapi-oyl/src/utils/README.md`.
export type ScopedActions = {
  find: (ctx: any) => Promise<unknown>
  findOne: (ctx: any) => Promise<unknown>
  create: (ctx: any) => Promise<unknown>
  update: (ctx: any) => Promise<unknown>
  delete: (ctx: any) => Promise<unknown>
}

type ControllerExtend = (params: { strapi: any; scoped: ScopedActions }) => Record<string, any>

export function createUserScopedController(
  uid: any,
  options: UserScopedOptions = {},
  extend?: ControllerExtend,
) {
  const ownerPath = options.ownerPath ?? 'user'
  const adminRoles = options.adminRoles
  const populate = buildOwnerPopulate(ownerPath)

  return factories.createCoreController(uid, ({ strapi }) => {
    const requireAuth = (ctx: any) => {
      if (!ctx.state.user) throw new errors.UnauthorizedError('You must be authenticated')
      return ctx.state.user
    }

    const assertOwnsDoc = async (documentId: string, userId: number | string) => {
      const doc = await strapi.documents(uid).findOne({ documentId, populate: populate as any })
      // Don't distinguish missing from forbidden -- both 404 so we never leak existence.
      if (!doc) throw new errors.NotFoundError()
      if (getOwnerIdAtPath(doc, ownerPath) !== userId) throw new errors.NotFoundError()
    }

    // Verify the parent record (e.g. user_goal) referenced in a create/update body
    // is itself owned by the caller. Only used when ownerPath has more than one segment.
    const assertOwnsParent = async (body: any, userId: number | string) => {
      const parts = ownerPath.split('.')
      const parentField = parts[0]
      const tailPath = parts.slice(1).join('.')
      const ref = body?.data?.[parentField]
      const parentDocumentId = typeof ref === 'object' && ref !== null ? (ref.documentId ?? ref.id) : ref
      if (!parentDocumentId) {
        throw new errors.ValidationError(`Missing required relation "${parentField}"`)
      }
      const parentAttr = (strapi.contentType(uid) as any).attributes?.[parentField]
      const parentUid = parentAttr?.target
      if (!parentUid) {
        throw new Error(`createUserScopedController: cannot resolve target UID for "${parentField}" on ${uid}`)
      }
      const parent = await strapi
        .documents(parentUid)
        .findOne({ documentId: parentDocumentId, populate: buildOwnerPopulate(tailPath) as any })
      if (!parent) throw new errors.NotFoundError()
      if (getOwnerIdAtPath(parent, tailPath) !== userId) throw new errors.NotFoundError()
    }

    // Build the owner-scoped CRUD in a single object literal whose methods
    // carry [[HomeObject]] pointing at the literal Strapi will call
    // `Object.setPrototypeOf` on. That's what makes `super.<action>` resolve
    // to the Strapi base controller at runtime.
    const userCtrl = {
      async find(ctx: any) {
        const user = requireAuth(ctx)
        if (!isAdmin(user, adminRoles)) {
          const ownerFilter = buildOwnerFilter(ownerPath, user.id)
          const existing =
            typeof ctx.query?.filters === 'object' && ctx.query.filters !== null ? ctx.query.filters : null
          ctx.query = {
            ...ctx.query,
            filters: existing ? { $and: [existing, ownerFilter] } : ownerFilter,
          }
        }
        // @ts-ignore -- super is provided by factories.createCoreController at runtime
        return await super.find(ctx)
      },

      async findOne(ctx: any) {
        const user = requireAuth(ctx)
        if (!isAdmin(user, adminRoles)) {
          await assertOwnsDoc(ctx.params.id, user.id)
        }
        // @ts-ignore
        return await super.findOne(ctx)
      },

      async create(ctx: any) {
        const user = requireAuth(ctx)
        if (!isAdmin(user, adminRoles)) {
          ctx.request.body = ctx.request.body ?? {}
          const data = (ctx.request.body.data = ctx.request.body.data ?? {})
          if (ownerPath === 'user') {
            data.user = user.id
          } else {
            await assertOwnsParent(ctx.request.body, user.id)
          }
        }
        // @ts-ignore
        return await super.create(ctx)
      },

      async update(ctx: any) {
        const user = requireAuth(ctx)
        if (!isAdmin(user, adminRoles)) {
          await assertOwnsDoc(ctx.params.id, user.id)
          const data = ctx.request.body?.data
          if (data) {
            if (ownerPath === 'user') {
              // Prevent transferring ownership via update.
              data.user = user.id
            } else {
              const parts = ownerPath.split('.')
              const parentField = parts[0]
              if (parentField in data) {
                await assertOwnsParent(ctx.request.body, user.id)
              }
            }
          }
        }
        // @ts-ignore
        return await super.update(ctx)
      },

      async delete(ctx: any) {
        const user = requireAuth(ctx)
        if (!isAdmin(user, adminRoles)) {
          await assertOwnsDoc(ctx.params.id, user.id)
        }
        // @ts-ignore
        return await super.delete(ctx)
      },
    }

    // Capture bound references to the scoped methods BEFORE extend overrides
    // them. Each scoped.* runs against the original userCtrl literal so its
    // super.X still resolves through Strapi's prototype setup, even when
    // called from an extend method whose own [[HomeObject]] would not.
    const scoped: ScopedActions = {
      find: userCtrl.find.bind(userCtrl),
      findOne: userCtrl.findOne.bind(userCtrl),
      create: userCtrl.create.bind(userCtrl),
      update: userCtrl.update.bind(userCtrl),
      delete: userCtrl.delete.bind(userCtrl),
    }

    if (extend) {
      assertNoForbiddenSuper(uid, extend)
      Object.assign(userCtrl, extend({ strapi, scoped }))
    }
    return userCtrl
  })
}

// Boot-time check that prevents the [[HomeObject]] footgun documented in
// utils/README.md: `super.<action>` inside an extend method silently
// resolves to `undefined` because the extend's literal is not the object
// Strapi calls setPrototypeOf on. Catch the pattern textually before the
// controller is wired up so the error fires at module-load time with a
// clear remediation, not at first request with a cryptic
// "(intermediate value).find is not a function".
const FORBIDDEN_SUPER = /\bsuper\s*\.\s*(find|findOne|create|update|delete)\b/
function assertNoForbiddenSuper(uid: string, extend: ControllerExtend) {
  const source = extend.toString()
  const match = source.match(FORBIDDEN_SUPER)
  if (match) {
    throw new Error(
      `[user-scoped-controller] extend for "${uid}" calls ${match[0]}. ` +
      `super.<action> inside an extend method does not resolve to the ` +
      `Strapi base controller because the method's [[HomeObject]] is the ` +
      `extend's own object literal, not the merged userCtrl Strapi sets ` +
      `the prototype on. Use the scoped.<action> parameter instead — ` +
      `see packages/strapi-oyl/src/utils/README.md ("Custom actions").`,
    )
  }
}

// Re-exported so custom controllers (like user-daily) can enforce the same
// invariant inside their own action handlers without re-implementing the check.
export async function assertDocumentOwned(
  strapi: any,
  uid: any,
  documentId: string,
  userId: number | string,
  ownerPath = 'user',
): Promise<void> {
  const populate = buildOwnerPopulate(ownerPath)
  const doc = await strapi.documents(uid).findOne({ documentId, populate: populate as any })
  if (!doc) throw new errors.NotFoundError()
  if (getOwnerIdAtPath(doc, ownerPath) !== userId) throw new errors.NotFoundError()
}

// Convenience for custom controllers (like user-daily) that build their own
// find query but still want owner scoping merged in.
export function injectOwnerFilter(ctx: any, userId: number | string, ownerPath = 'user'): void {
  const ownerFilter = buildOwnerFilter(ownerPath, userId)
  const existing =
    typeof ctx.query?.filters === 'object' && ctx.query.filters !== null ? ctx.query.filters : null
  ctx.query = {
    ...ctx.query,
    filters: existing ? { $and: [existing, ownerFilter] } : ownerFilter,
  }
}
