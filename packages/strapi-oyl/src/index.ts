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
  // Actions that must be granted on relation *targets* so that
  // throwRestrictedRelations lets a write through. Strapi 5 checks
  // `<target-uid>.find` whenever a relation key is included in the body —
  // see @strapi/utils/dist/validate/visitors/throw-restricted-relations.mjs.
  // Without this, every user-scoped controller's auto-injected `user`
  // relation (`plugin::users-permissions.user`) fails validation with
  // "Invalid key user" on a fresh DB.
  const relationTargetActions = new Set<string>();
  for (const uid of apiUids) {
    const ct = strapi.contentTypes[uid as keyof typeof strapi.contentTypes];
    const attrs = (ct as { attributes?: Record<string, { type?: string; target?: string }> })
      .attributes;
    if (!attrs) continue;
    for (const attr of Object.values(attrs)) {
      if (attr.type === 'relation' && typeof attr.target === 'string') {
        relationTargetActions.add(`${attr.target}.find`);
      }
    }
  }

  let granted = 0;
  const grantAction = async (actionString: string) => {
    const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
      where: { action: actionString, role: role.id },
    });
    if (existing) return;
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
  };

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
      await grantAction(`api::${apiName}.${ctName}.${action}`);
    }
  }

  // Grant `.find` on every relation target referenced by an api::* content type.
  for (const action of relationTargetActions) {
    await grantAction(action);
  }

  if (granted > 0) {
    strapi.log.info(
      `[dev-bootstrap] Granted ${granted} permission(s) to the Authenticated role`,
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
