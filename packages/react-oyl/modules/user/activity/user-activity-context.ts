import { createContext, useContext } from 'react'
import type { 
  TUserActivityData,
  TUserActivitySettings,
} from '@oyl/all-of-oyl/modules'


type UserActivityContext = {
  startDate: string
  setStartDate: (v: string) => void
  endDate: string
  setEndDate: (v: string) => void

  activity: TUserActivityData | null
  setActivity: (v: TUserActivityData | null) => void
  activities: TUserActivityData[]
  toggleActivity: (v: number) => void
  showActivityForm: boolean
  setActivityForm: (v: TUserActivityData) => void
  onChangeActivity: (field: keyof TUserActivityData, value: TUserActivityData[keyof TUserActivityData]) => void
  addActivity: (payload: { name: string; duration: number; time: string }) => void
  cancelActivityForm: () => void
  setShowActivityForm: (v: boolean) => void
  showActivitySettings: number | null
  setShowActivitySettings: (v: number | null) => void
  selectedActivityForSettings: TUserActivityData
  activitySettings: TUserActivitySettings
  onChangeActivitySettings: (field: keyof TUserActivitySettings, value: TUserActivitySettings[keyof TUserActivitySettings]) => void
  saveActivitySettings: () => void
  cancelActivitySettings: () => void
}

const defaultActivitySettings: TUserActivitySettings = {
  autoAdd: false,
  frequency: 'daily',
  selectedDays: [],
  intervalDays: 1,
  startDate: new Date().toISOString().split('T')[0],
  hasEndDate: false,
  endDate: ''
}

export const defaultActivities: TUserActivityData[] = [
  { id: 1, name: 'DelMe - Morning Workout', duration: 30, completed: false, time: '07:00' },
  { id: 2, name: 'DelMe - Walk the Dog', duration: 15, completed: true, time: '18:30' },
  { id: 3, name: 'DelMe - Meditation', duration: 10, completed: false, time: '20:00' }
]

const defaultContext: UserActivityContext = {
  startDate: '',
  setStartDate: () => {},
  endDate: '',
  setEndDate: () => {},

  activity: null,
  setActivity: () => {},
  activities: [],
  toggleActivity: () => {},
  showActivityForm: false,
  setActivityForm: () => {},
  onChangeActivity: () => {},
  addActivity: () => {},
  cancelActivityForm: () => {},
  setShowActivityForm: () => {},
  showActivitySettings: null,
  setShowActivitySettings: () => {},
  selectedActivityForSettings: null,
  activitySettings: defaultActivitySettings,
  onChangeActivitySettings: () => {},
  saveActivitySettings: () => {},
  cancelActivitySettings: () => {},
}

export const context = createContext<UserActivityContext>(defaultContext)

export const useUserActivityContext = () => useContext(context)