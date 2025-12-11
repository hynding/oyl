import { useData } from '@/modules/data';
import { UserDailyType } from './UserDailyType'

export function useUserDaily(date: string = ''): UserDailyType {
  const data = useData<UserDailyType>(`/user-dailies/${date}`);

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