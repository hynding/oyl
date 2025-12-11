/**
 * user-profile controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::user-profile.user-profile', ({ strapi }) => ({
  async find(ctx) {
    console.log('ctx', ctx.query.filters)
    ctx.query = {
      ...ctx.query,
      // user: { $eq: ctx.state.user.id },
      filters: { user: { id: { $eq: ctx.state.user.id } } }
    }
    // ctx.filters = {
    //   ...ctx.filters,
    //   // user: ctx.state.user.id,
    //   user: { id: { $eq: ctx.state.user.id } }
    // }
    ctx.query.populate = ['activities', 'goals', 'nutrition_items'];
    return await super.find(ctx);
  },
}));
