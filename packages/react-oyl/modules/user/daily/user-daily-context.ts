import { createContext, useContext } from 'react'
import type { TUserDailyData } from '@oyl/all-of-oyl/modules'

type UserDailyContext = {
  selectedDate: string
  setSelectedDate: (v: string) => void
  userDailyData: TUserDailyData
}

const defaultContext: UserDailyContext = {
  selectedDate: '',
  setSelectedDate: () => {},
  userDailyData: {
    date: '',
    activities: [],
    goals: [],
    nutritions: []
  }
}

export const userDailyContext = createContext<UserDailyContext>(defaultContext)

export const useUserDailyContext = () => useContext(userDailyContext)
