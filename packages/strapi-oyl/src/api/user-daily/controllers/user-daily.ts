// user-daily controller
//
// Default CRUD is owner-scoped via the shared factory (find/findOne/create/
// update/delete all enforce ownership automatically). On top of that we expose
// two custom actions used by the daily UI:
//
//   GET  /user-dailies/:date  -> findOneByDate
//   POST /user-dailies/:date  -> saveByDate
//
// Custom actions don't get free enforcement, so they call the shared helpers
// (assertDocumentOwned, injectOwnerFilter) instead of trusting the body.
//
// See src/utils/README.md for the pattern.

import {
  assertDocumentOwned,
  createUserScopedController,
  injectOwnerFilter,
} from '../../../utils/user-scoped-controller'

const UID = 'api::user-daily.user-daily' as const

export default createUserScopedController(UID, {}, ({ strapi }) => ({
  async findOneByDate(ctx: any) {
    const user = ctx.state.user
    if (!user) return ctx.unauthorized('You are not logged in')
    const userId = user.id
    const date = ctx.params.date

    ctx.query = { ...ctx.query, filters: { date: { $eq: date } } }
    injectOwnerFilter(ctx, userId)

    const dailies = await strapi.documents(UID).findMany(ctx.query)

    const profileData = await strapi.documents('api::user-profile.user-profile').findFirst({
      filters: { user: { id: { $eq: userId } } },
      populate: {
        activity_settings: { populate: ['activity'] },
        goal_settings: { populate: ['goal'] },
        nutrition_settings: { populate: ['nutrition_item'] },
      },
    })

    return { data: dailies, profileData, meta: {} }
  },

  async saveByDate(ctx: any) {
    const user = ctx.state.user
    if (!user) return ctx.unauthorized('You are not logged in')
    const userId = user.id
    const date = ctx.params.date
    const {
      documentId,
      activities = [],
      goals = [],
      nutritions = [],
      journal,
    } = ctx.request.body ?? {}

    if (documentId) {
      await assertDocumentOwned(strapi, UID, documentId, userId)
    }

    const activityIds = await Promise.all(
      activities.map(async (item: any) => {
        const activityDate = new Date(`${date} ${item.time || '00:00'}`).toISOString()
        let activityId = item.activity?.id
        let docId = item.documentId

        if (!activityId) {
          const created = await strapi.documents('api::activity.activity').create({
            data: { name: item.activity?.name },
          })
          activityId = created.id
        }

        if (!docId) {
          const created = await strapi.documents('api::user-activity.user-activity').create({
            data: {
              user: userId,
              date: activityDate,
              activity: activityId,
              duration: item.duration,
              data: item.data || {},
            },
          })
          return created.documentId
        }

        if (item.updated) {
          await assertDocumentOwned(strapi, 'api::user-activity.user-activity', docId, userId)
          await strapi.documents('api::user-activity.user-activity').update({
            documentId: docId,
            data: {
              date: activityDate,
              activity: activityId,
              duration: item.duration || 0,
              data: item.data || {},
            },
          })
        }
        return docId
      }),
    )

    const goalIds = await Promise.all(
      goals.map(async (item: any) => {
        const goalDate = new Date(`${date} ${item.time || '00:00'}`).toISOString()
        let goalId = item.goal?.id
        let docId = item.documentId

        if (!goalId) {
          const created = await strapi.documents('api::goal.goal').create({
            data: { name: item.goal?.name },
          })
          goalId = created.id
        }

        if (!docId) {
          const created = await strapi.documents('api::user-goal.user-goal').create({
            data: {
              user: userId,
              date: goalDate,
              goal: goalId,
              progress: item.progress || 0,
              target: item.target || 100,
              data: item.data || {},
            },
          })
          return created.documentId
        }

        if (item.updated) {
          await assertDocumentOwned(strapi, 'api::user-goal.user-goal', docId, userId)
          await strapi.documents('api::user-goal.user-goal').update({
            documentId: docId,
            data: {
              date: goalDate,
              goal: goalId,
              progress: item.progress || 0,
              target: item.target || 100,
              data: item.data || {},
            },
          })
        }
        return docId
      }),
    )

    const nutritionIds = await Promise.all(
      nutritions.map(async (item: any) => {
        const nutritionDate = new Date(`${date} ${item.time || '00:00'}`).toISOString()
        let nutritionItemId = item.nutrition?.id
        let docId = item.documentId

        if (!nutritionItemId) {
          const created = await strapi.documents('api::nutrition-item.nutrition-item').create({
            data: { name: item.nutrition?.name },
          })
          nutritionItemId = created.id
        }

        if (!docId) {
          const created = await strapi.documents('api::user-nutrition.user-nutrition').create({
            data: {
              user: userId,
              date: nutritionDate,
              nutrition: nutritionItemId,
              servings: item.servings || 0,
              data: item.data || {},
            },
          })
          return created.documentId
        }

        if (item.updated) {
          await assertDocumentOwned(strapi, 'api::user-nutrition.user-nutrition', docId, userId)
          await strapi.documents('api::user-nutrition.user-nutrition').update({
            documentId: docId,
            data: {
              servings: item.servings || 0,
              data: item.data || {},
            },
          })
        }
        return docId
      }),
    )

    if (!documentId) {
      return await strapi.documents(UID).create({
        data: {
          user: userId,
          date,
          journal,
          activities: activityIds,
          goals: goalIds,
          nutritions: nutritionIds,
        },
      })
    }

    return await strapi.documents(UID).update({
      documentId,
      data: {
        journal,
        activities: activityIds,
        goals: goalIds,
        nutritions: nutritionIds,
      },
    })
  },
}))
