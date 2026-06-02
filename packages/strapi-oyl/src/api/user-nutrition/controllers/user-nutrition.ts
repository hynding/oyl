// user-nutrition controller — owner-scoped + soft delete via deleted_at.
import { createUserScopedController } from '../../../utils/user-scoped-controller'

const UID = 'api::user-nutrition.user-nutrition' as const

export default createUserScopedController(UID, {}, () => ({
  async delete(ctx: any) {
    // The factory's update path already enforces ownership.
    ctx.request.body = { data: { deleted_at: new Date().toISOString() } }
    // @ts-ignore -- super.update is the owner-scoped factory action.
    return await super.update(ctx)
  },
}))
