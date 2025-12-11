export type UserProfileType = {
  activities: {
    id: string;
    activity: Record<string, unknown>;
    include: string;
    order: number;
  }[];
  goals: unknown[];
  nutrition: unknown[];
}