import { ActivityType } from './ActivityType';

export function useActivity(search: string = ''): ActivityType[] {
  const activities = [
    {
      id: '1',
      name: 'Running',
    },
    {
      id: '2',
      name: 'Swimming',
    },
  ];

  return activities
    .filter(activity => activity.name.toLowerCase().includes(search.toLowerCase()));
}
