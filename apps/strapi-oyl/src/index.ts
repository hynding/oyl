import type { Core } from '@strapi/strapi'

const NOTE_ACTIONS = ['find', 'findOne', 'create', 'update', 'delete'].map((a) => `api::note.note.${a}`)

const ACTIVITY_ACTIONS = ['find', 'findOne', 'create', 'update', 'delete'].map((a) => `api::activity.activity.${a}`)

const CONSUMABLE_ACTIONS = ['find', 'findOne', 'create', 'update', 'delete'].map((a) => `api::consumable.consumable.${a}`)

async function grantRoleActions(strapi: Core.Strapi, roleType: string, actions: string[], label: string) {
  const role = (await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: roleType } })) as { id: number } | null
  if (!role) { strapi.log.warn(`[oyl] ${roleType} role not found; skipping ${label} permission grant`); return }
  for (const action of actions) {
    const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({ where: { action, role: role.id } })
    if (!existing) await strapi.db.query('plugin::users-permissions.permission').create({ data: { action, role: role.id } })
  }
}

const PUBLIC_AUTH_ACTIONS = [
  'plugin::users-permissions.auth.register',
  'plugin::users-permissions.auth.callback',
]

async function grantPublicAuth(strapi: Core.Strapi) {
  const role = (await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'public' } })) as { id: number } | null
  if (!role) { strapi.log.warn('[oyl] public role not found; skipping auth permission grant'); return }
  for (const action of PUBLIC_AUTH_ACTIONS) {
    const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({ where: { action, role: role.id } })
    if (!existing) await strapi.db.query('plugin::users-permissions.permission').create({ data: { action, role: role.id } })
  }
}

export default {
  register(_ctx: { strapi: Core.Strapi }) {},
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await grantPublicAuth(strapi)
    await grantRoleActions(strapi, 'authenticated', NOTE_ACTIONS, 'note')
    await grantRoleActions(strapi, 'authenticated', ACTIVITY_ACTIONS, 'activity')
    await grantRoleActions(strapi, 'authenticated', CONSUMABLE_ACTIONS, 'consumable')
  },
}
