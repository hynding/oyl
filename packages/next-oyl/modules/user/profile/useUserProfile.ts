import { UserProfileType } from './UserProfileType';

export function useUserProfile(): UserProfileType {
  return {
    activities: [
      {
        id: "a",
        activity: {},
        include: "daily",
        order: 1,
      }
    ],
    goals: [],
    nutrition: [] 
  }
}