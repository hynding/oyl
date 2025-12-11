import { useData } from '@/modules/data';

export default function useUserActivities() {
  const { 
    get: fetchUserActivity, 
    find: fetchUserActivities, 
    save: saveUserActivity
  } = useData('user-activities')
  
  return {
    fetchUserActivity,
    fetchUserActivities,
    saveUserActivity
  }
}