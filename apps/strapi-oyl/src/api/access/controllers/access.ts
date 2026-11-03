import { isAdminEmail } from '../../../utils/admins'

/**
 * GET /access → `{ admin }` for the signed-in user. Admins are the `OYL_ADMIN_EMAILS`
 * allowlist (exact addresses or `@domain`; unset = nobody), read per call so a restart
 * after changing it is all it takes (and tests can set it).
 */
export default {
  async find(ctx: any) {
    const user = ctx.state.user as { id?: number; email?: string } | undefined
    if (user?.id == null) return ctx.unauthorized()
    ctx.body = { admin: isAdminEmail(user.email, process.env['OYL_ADMIN_EMAILS']) }
  },
}
