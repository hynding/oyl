type UserDaily = {
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

export default function useUserDaily(date: string = ''): UserDaily {
  return {
    activities: [
      {
        id: 'xyz',
        activity: {},
        duration: 30,
        completed: false,
        time: '07:00'
      }
    ],
    goals: [],
    nutrition: []
  }
}