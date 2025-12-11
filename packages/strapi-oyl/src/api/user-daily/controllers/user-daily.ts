/**
 * user-daily controller
 */

import { factories } from '@strapi/strapi'
import { act } from 'react';

export default factories.createCoreController('api::user-daily.user-daily', ({ strapi }) => ({
  async find(ctx) {
    console.log('find')
    if (!ctx.state.user) {
      return ctx.unauthorized('You are not logged in');
    }
    const filters = {
      ...(typeof ctx.query?.filters === 'object' && ctx.query.filters !== null ? ctx.query.filters : {}),
      user: { id: { $eq: ctx.state.user.id } }
    };
    ctx.query = {
      ...ctx.query,
      user: ctx.state.user.id,
    }
    //
    const { data, meta } = await super.find(ctx);

    // const result = await strapi.documents('api::user-goal.user-goal').findMany({
    //   filters: { 
    //     user: ctx.state.user.id,
    //     date: {
    //       $startsWith: typeof ctx.query.filters === 'object' && ctx.query.filters !== null
    //       ? (ctx.query.filters as { date?: { $eq?: string } }).date?.$eq
    //       : undefined
    //     }
    //   },
    // });
    return { data, meta };
  },
  async findOneByDate(ctx) {
    if (!ctx.state.user) {
      return ctx.unauthorized('You are not logged in');
    }
    const userId = ctx.state.user.id;
    const date = ctx.params.date;
    const filters = { 
      date: { $eq: date },
      user: { id: { $eq: userId } }
    };
    ctx.query = { filters }
    
    const { data, meta } = await super.find(ctx);
    const profileData = await strapi.documents('api::user-profile.user-profile').findFirst({
      filters: { 
        user: { id: { $eq: userId } }
      },
      populate: {
        activity_settings: {
          populate: ["activity"]
        },
        goal_settings: {
          populate: ["goal"]
        },
        nutrition_settings: {
          populate: ["nutrition_item"]
        }
      }
    });

    return { data, profileData, meta };
  },
  async saveByDate(ctx) {
    if (!ctx.state.user) {
      return ctx.unauthorized('You are not logged in');
    }

    const userId = ctx.state.user.id;
    const date = ctx.params.date;
    const { 
      documentId,
      activities = [], 
      goals = [], 
      nutrition = [], 
      journal, 
      isUpdated 
    } = ctx.request.body;
    
    /*
      Test data:
      {
        date: 'xxx',
        user: '',
        journal: '',
        activities: [
          {
            // new activity
            name: 'Running',
            duration: 30
          },
          {
            // existing activity, new user-activity
            activityId: 'xxx',
            name: 'Cycling',
            duration: 45
          },
          {
            // existing user activity
            id: 'xxx',
            activityId: 'xxx',
            name: 'Cycling',
            duration: 45
          }
        ]
      }
      
      1. Create user-daily if not exists
      2. Add new activities, append id (TODO: edge-case: another user added activity)
      3. Save as user-activity
      4. Update user-daily with relations

    */

    const activityIds = activities.map(async (item: any) => {
      const updated = item.updated
      const activityDate = new Date(`${date} ${item.time || '00:00'}`).toISOString()
      let activityId = item.activity?.id;
      let documentId = item.documentId;
      if (!activityId) {
        // Create new activity
        const newActivity = await strapi.documents('api::activity.activity').create({
          data: {
            name: item.activity?.name,
          }
        });
        activityId = newActivity.id;
      }
      let result;
      if (!documentId) {
        result = await strapi.documents('api::user-activity.user-activity').create({
          data: {
            user: userId,
            date: activityDate,
            activity: activityId,
            duration: item.duration,
            data: item.data || {},
          }
        });
        documentId = result.documentId;
      } else if (updated) {
        result = await strapi.documents('api::user-activity.user-activity').update({
          documentId,
          data: {
            user: userId,
            date: activityDate,
            activity: activityId,
            duration: item.duration || 0,
            data: item.data || {},
          }
        });
      }
      return result?.documentId || documentId;

    });

    const goalIds = goals.map(async (item: any) => {
      const updated = item.updated
      const goalDate = new Date(`${date} ${item.time || '00:00'}`).toISOString()
      let goalId = item.goal?.id;
      let documentId = item.documentId;
      if (!goalId) {
        // Create new goal
        const newGoal = await strapi.documents('api::goal.goal').create({
          data: {
            name: item.goal?.name,
          }
        });
        goalId = newGoal.id;
      }
      let result;
      if (!documentId) {
        result = await strapi.documents('api::user-goal.user-goal').create({
          data: {
            user: userId,
            date: goalDate,
            goal: goalId,
            progress: item.progress || 0,
            target: item.target || 100,
            data: item.data || {},
          }
        });
        documentId = result.documentId;
      } else if (updated) {
        result = await strapi.documents('api::user-goal.user-goal').update({
          documentId,
          data: {
            user: userId,
            date: goalDate,
            goal: goalId,
            progress: item.progress || 0,
            target: item.target || 100,
            data: item.data || {},
          }
        });
      }
      return result?.documentId || documentId;

    });

    const nutritionIds = nutrition.map(async (item: any) => {
      const updated = item.updated
      const nutritionDate = new Date(`${date} ${item.time || '00:00'}`).toISOString()
      let nutritionId = item.nutrition?.id;
      let documentId = item.documentId;
      if (!nutritionId) {
        // Create new nutrition
        const newNutrition = await strapi.documents('api::nutrition-item.nutrition-item').create({
          data: {
            name: item.nutrition?.name,
          }
        });
        nutritionId = newNutrition.id;
      }
      let result;
      if (!documentId) {
        result = await strapi.documents('api::user-nutrition.user-nutrition').create({
          data: {
            user: userId,
            date: nutritionDate,
            nutrition: nutritionId,
            servings: item.servings || 0,
            data: item.data || {},
          }
        });
        documentId = result.documentId;
      } else if (updated) {
        result = await strapi.documents('api::user-nutrition.user-nutrition').update({
          documentId,
          data: {
            user: userId,
            servings: item.servings || 0,
            data: item.data || {},
          }
        });
        documentId = result.documentId;
      }
      return result?.documentId || documentId;

    });

    let dailyRecord;

    if (!documentId) {
      dailyRecord = await strapi.documents('api::user-daily.user-daily').create({
        data: {
          user: userId,
          date: date,
          journal: journal,
          activities: await Promise.all(activityIds),
          goals: await Promise.all(goalIds),
          nutrition: await Promise.all(nutritionIds),
        }
      });
    } else {
      dailyRecord = await strapi.documents('api::user-daily.user-daily').update({
        documentId,
        data: {
          journal: journal,
          activities: await Promise.all(activityIds),
          goals: await Promise.all(goalIds),
          nutrition: await Promise.all(nutritionIds),
        }
      });
    }

    return dailyRecord;
  }
}));
