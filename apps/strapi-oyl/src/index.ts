import type { Core } from '@strapi/strapi'
export default {
  register(_ctx: { strapi: Core.Strapi }) {},
  async bootstrap(_ctx: { strapi: Core.Strapi }) {}, // SP2.2 grants the authenticated role the /v1 actions here
}
