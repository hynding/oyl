export type UserDailyType = {
  activities: {
    id: string;
    activity: Record<string, unknown>;
    duration: number;
    completed: boolean;
    time: string;
  }[];
  goals: unknown[];
  nutrition: unknown[];
}