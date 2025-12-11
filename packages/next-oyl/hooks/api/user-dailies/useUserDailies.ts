import { useCallback } from 'react'
import useCMS from '../../useCMS'
import useAsync from '../../useAsync'

export default function useUserDailiesApi() {
  const cms = useCMS()

  const findUserDaily = useAsync(useCallback(async (selectedDate: string) => {
    const result = await cms.collection('user-dailies').find({
      filters: {
        // user: { id: { $eq: user.id } },
        date: { $eq: selectedDate }
      },
      populate: { 
        activities: { populate: ['activity'] }, 
        goals: { populate: ['goal'] }, 
        nutrition: { populate: ['nutrition_item'] } 
      }
    })
    return result?.data?.[0] || null
  }, [cms]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createUserDaily = useAsync(useCallback(async (data: any) => {
    return await cms.collection('user-dailies').create({ data })
  }, [cms]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateUserDaily = useAsync(useCallback(async (id: string, data: any) => {
    return await cms.collection('user-dailies').update(id, { data })
  }, [cms]))

  const save = () => {
    cms.collection('user-dailies')
  }

  return { findUserDaily, createUserDaily, updateUserDaily }
}