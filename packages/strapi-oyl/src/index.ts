import type { Core } from '@strapi/strapi';

const DEV_PERMISSION_ACTIONS = ['find', 'findOne', 'create', 'update', 'delete'] as const;

/**
 * In non-production environments, grant the Authenticated role default CRUD
 * permissions on every `api::*` content type so a freshly-provisioned Strapi
 * (verify stack, Playwright e2e harness, local dev) is immediately usable
 * without manually clicking through Settings → Users & Permissions → Roles.
 *
 * Idempotent: skips actions that already exist on the role. Safe to leave
 * enabled across restarts.
 */
async function grantAuthenticatedDevPermissions(strapi: Core.Strapi) {
  if (process.env.NODE_ENV === 'production') return;

  const role = (await strapi.db.query('plugin::users-permissions.role').findOne({
    where: { type: 'authenticated' },
  })) as { id: number } | null;

  if (!role) {
    strapi.log.warn('[dev-bootstrap] Authenticated role not found; skipping CRUD permission seed');
    return;
  }

  const apiUids = Object.keys(strapi.contentTypes).filter(uid => uid.startsWith('api::'));
  let granted = 0;

  for (const uid of apiUids) {
    const [, apiAndCt] = uid.split('::');
    const [apiName, ctName] = apiAndCt.split('.');

    // Restrict to actions the controller actually implements — custom-route
    // controllers (e.g. nutrition-search) may not have all five.
    const controller = strapi.controller(uid as never) as Record<string, unknown> | undefined;
    const availableActions = controller
      ? DEV_PERMISSION_ACTIONS.filter(a => typeof controller[a] === 'function')
      : DEV_PERMISSION_ACTIONS;

    for (const action of availableActions) {
      const actionString = `api::${apiName}.${ctName}.${action}`;
      const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
        where: { action: actionString, role: role.id },
      });
      if (existing) continue;
      try {
        await strapi.db.query('plugin::users-permissions.permission').create({
          data: { action: actionString, role: role.id },
        });
        granted++;
      } catch (err) {
        strapi.log.debug(
          `[dev-bootstrap] could not grant ${actionString}: ${(err as Error).message}`,
        );
      }
    }
  }

  if (granted > 0) {
    strapi.log.info(
      `[dev-bootstrap] Granted ${granted} CRUD permission(s) to the Authenticated role`,
    );
  }
}

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await grantAuthenticatedDevPermissions(strapi);
  },
};
