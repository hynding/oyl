import { createContext } from 'react'
import type { 
  TUserActivityData,
  TUserActivitySettings,
  TUserGoalData,
  TUserNutritionData,
} from '@oyl/all-of-oyl/modules'


type DailyContext = {
  selectedDate: string
  setSelectedDate: (v: string) => void

  activities: TUserActivityData[]
  toggleActivity: (v: number) => void
  showActivityForm: boolean
  activityForm: TUserActivityData
  setActivityForm: (v: TUserActivityData) => void
  onChangeActivity: (field: keyof TUserActivityData, value: TUserActivityData[keyof TUserActivityData]) => void
  addActivity: () => void
  cancelActivityForm: () => void
  setShowActivityForm: (v: boolean) => void
  showActivitySettings: number | null
  setShowActivitySettings: (v: number | null) => void
  selectedActivityForSettings: TUserActivityData
  activitySettings: TUserActivitySettings
  onChangeActivitySettings: (field: keyof TUserActivitySettings, value: TUserActivitySettings[keyof TUserActivitySettings]) => void
  saveActivitySettings: () => void
  cancelActivitySettings: () => void

  goals: TUserGoalData[]
  showGoalForm: boolean
  setShowGoalForm: (v: boolean) => void
  newGoal: { title: string; description: string; target: string }
  setNewGoal: (v: { title: string; description: string; target: string }) => void
  onChangeGoal: (field: keyof { title: string; description: string; target: string }, value: string) => void
  addGoal: () => void
  cancelGoalForm: () => void
  handleSliderChange: (id: number, value: string) => void

  foodItems: TUserNutritionData[]
  showFoodForm: boolean
  setShowFoodForm: (v: boolean) => void
  newFood: { name: string; calories: string; protein: string; carbs: string; fat: string; time: string }
  setNewFood: (v: { name: string; calories: string; protein: string; carbs: string; fat: string; time: string }) => void
  onChangeFood: (field: keyof { name: string; calories: string; protein: string; carbs: string; fat: string; time: string }, value: string) => void
  addFood: () => void
  cancelFoodForm: () => void,
  totalCalories: number,
  totalProtein: number,
  totalCarbs: number,
  totalFat: number
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

export const defaultGoals: TUserGoalData[] = [
  { id: 1, name: 'Daily Steps', description: 'Walk 10,000 steps', progress: 7500, target: 10000, completed: false },
  { id: 2, name: 'Water Intake', description: 'Drink 8 glasses of water', progress: 6, target: 8, completed: false },
  { id: 3, name: 'Reading', description: 'Read for 30 minutes', progress: 30, target: 30, completed: true }
]

export const defaultFoodItems: TUserNutritionData[] = [
  { id: 1, name: 'Oatmeal with Berries', calories: 320, protein: 12, carbs: 54, fat: 8, time: '08:00' },
  { id: 2, name: 'Grilled Chicken Salad', calories: 450, protein: 35, carbs: 15, fat: 28, time: '12:30' },
  { id: 3, name: 'Apple with Almonds', calories: 190, protein: 6, carbs: 25, fat: 12, time: '15:30' }
]

const defaultContext: DailyContext = {
  selectedDate: '',
  setSelectedDate: () => {},

  activities: [],
  toggleActivity: () => {},
  showActivityForm: false,
  activityForm: {} as TUserActivityData,
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

  goals: [],
  showGoalForm: false,
  setShowGoalForm: () => {},
  newGoal: { title: '', description: '', target: '' },
  setNewGoal: () => {},
  onChangeGoal: () => {},
  addGoal: () => {},
  cancelGoalForm: () => {},
  handleSliderChange: () => {},

  foodItems: [],
  showFoodForm: false,
  newFood: { name: '', calories: '', protein: '', carbs: '', fat: '', time: '' },
  setNewFood: () => {},
  onChangeFood: () => {},
  addFood: () => {},
  setShowFoodForm: () => {},
  cancelFoodForm: () => {},
  totalCalories: 0,
  totalProtein: 0,
  totalCarbs: 0,
  totalFat: 0
}

export const context = createContext<DailyContext>(defaultContext)