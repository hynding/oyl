// user-nutrition controller — owner-scoped + soft delete via deleted_at.
import { createUserScopedController } from '../../../utils/user-scoped-controller'

const UID = 'api::user-nutrition.user-nutrition' as const

export default createUserScopedController(UID, {}, ({ scoped }) => ({
  async delete(ctx: any) {
    // Reroute delete to the owner-scoped update so the row is soft-deleted
    // (deleted_at set) instead of physically removed.
    ctx.request.body = { data: { deleted_at: new Date().toISOString() } }
    return await scoped.update(ctx)
  },
}))
