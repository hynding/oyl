import type { Core } from '@strapi/strapi'

const V1_ACTIONS = ['list', 'findOne', 'upsert', 'remove', 'batch'].map((a) => `api::oyl-record.oyl-record.${a}`)

const NOTE_ACTIONS = ['find', 'findOne', 'create', 'update', 'delete'].map((a) => `api::note.note.${a}`)

async function grantAuthenticated(strapi: Core.Strapi) {
  const role = (await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } })) as { id: number } | null
  if (!role) { strapi.log.warn('[oyl] authenticated role not found; skipping /v1 permission grant'); return }
  for (const action of V1_ACTIONS) {
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

async function grantNoteActions(strapi: Core.Strapi) {
  const role = (await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } })) as { id: number } | null
  if (!role) { strapi.log.warn('[oyl] authenticated role not found; skipping note permission grant'); return }
  for (const action of NOTE_ACTIONS) {
    const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({ where: { action, role: role.id } })
    if (!existing) await strapi.db.query('plugin::users-permissions.permission').create({ data: { action, role: role.id } })
  }
}

export default {
  register(_ctx: { strapi: Core.Strapi }) {},
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await grantAuthenticated(strapi)
    await grantPublicAuth(strapi)
    await grantNoteActions(strapi)
  },
}
