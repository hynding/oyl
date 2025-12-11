type UserProfile = {
  activities: {
    id: string;
    activity: Record<string, unknown>;
    include: string;
    order: number;
  }[];
  goals: unknown[];
  nutrition: unknown[];
}

export default function useUserProfile(): UserProfile {
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