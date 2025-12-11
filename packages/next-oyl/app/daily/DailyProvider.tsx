import React, { createContext, useContext, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  TActivity,
  TGoal,
  TNutritionItem,
  TUserActivity, 
  TUserGoal, 
  TUserNutrition
} from '@oyl/all-of/modules'
import useAuth from '@/hooks/useAuth'
import useCMS from '@/hooks/useCMS'
import { useUserDaily, useUserProfile } from '@/modules/user'

interface Activity {
  id: number
  name: string
  duration: number | string
  completed: boolean
  time?: string
  activity?: { id: number; name: string }
  settings?: ActivitySettings
}

interface ActivitySettings {
  autoAdd: boolean
  frequency: 'daily' | 'specific-days' | 'interval'
  selectedDays: number[]
  intervalDays: number
  startDate: string
  hasEndDate: boolean
  endDate: string
}

interface Goal {
  id: number
  name: string
  description: string
  progress: number
  target: number
  completed: boolean
  goal?: { id: number; name: string }
}

interface FoodItem {
  id: number
  name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  time: string
  nutrition_item?: { id: number; name: string }
}

type DailyContext = {
  selectedDate: string
  setSelectedDate: (v: string) => void

  activities: Activity[]
  toggleActivity: (v: number) => void
  showActivityForm: boolean
  newActivity: Pick<Activity, 'name' | 'duration' | 'time'>
  setNewActivity: (v: Pick<Activity, 'name' | 'duration' | 'time'>) => void
  onChangeActivity: (field: keyof Pick<Activity, 'name' | 'duration' | 'time'>, value: string | number) => void
  addActivity: () => void
  cancelActivityForm: () => void
  setShowActivityForm: (v: boolean) => void
  showActivitySettings: number | null
  setShowActivitySettings: (v: number | null) => void
  selectedActivityForSettings: Activity | null
  activitySettings: ActivitySettings
  onChangeActivitySettings: (field: keyof ActivitySettings, value: string | boolean | number | number[]) => void
  saveActivitySettings: () => void
  cancelActivitySettings: () => void

  goals: Goal[]
  showGoalForm: boolean
  setShowGoalForm: (v: boolean) => void
  newGoal: { title: string; description: string; target: string }
  setNewGoal: (v: { title: string; description: string; target: string }) => void
  onChangeGoal: (field: keyof { title: string; description: string; target: string }, value: string) => void
  addGoal: () => void
  cancelGoalForm: () => void
  handleSliderChange: (id: number, value: string) => void

  foodItems: FoodItem[]
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

const defaultActivitySettings: ActivitySettings = {
  autoAdd: false,
  frequency: 'daily',
  selectedDays: [],
  intervalDays: 1,
  startDate: new Date().toISOString().split('T')[0],
  hasEndDate: false,
  endDate: ''
}

const defaultContext: DailyContext = {
  selectedDate: '',
  setSelectedDate: () => {},

  activities: [],
  toggleActivity: () => {},
  showActivityForm: false,
  newActivity: {} as Pick<Activity, 'name' | 'duration' | 'time'>,
  setNewActivity: () => {},
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

const context = createContext<DailyContext>(defaultContext)

const Provider = context.Provider

export const useDailyProvider = () => useContext(context)

export default function DailyProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth()
  const router = useRouter()
  const cms = useCMS()

  const { activities: dailyActivities } = useUserDaily()
  const { activities: profileActivities } = useUserProfile()

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [activities, setActivities] = useState<Activity[]>([
    { id: 1, name: 'Morning Workout', duration: 30, completed: false, time: '07:00' },
    { id: 2, name: 'Walk the Dog', duration: 15, completed: true, time: '18:30' },
    { id: 3, name: 'Meditation', duration: 10, completed: false, time: '20:00' }
  ])

  const [showActivityForm, setShowActivityForm] = useState(false)
  const [newActivity, setNewActivity] = useState<Pick<Activity, 'name' | 'duration' | 'time'>>({
    name: '',
    duration: '',
    time: ''
  })

  const [activityForm, setActivityForm] = useState<Pick<Activity, 'name' | 'duration' | 'time'>>({
    name: '',
    duration: '',
    time: ''
  })

  const onChangeActivity = (field: keyof Pick<Activity, 'name' | 'duration' | 'time'>, value: string | number) => {
    setActivityForm(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Activity Settings State
  const [showActivitySettings, setShowActivitySettings] = useState<number | null>(null)
  const [activitySettings, setActivitySettings] = useState<ActivitySettings>(defaultActivitySettings)

  const selectedActivityForSettings = activities.find(a => a.id === showActivitySettings) || null

  const onChangeActivitySettings = (field: keyof ActivitySettings, value: string | boolean | number | number[]) => {
    setActivitySettings(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const saveActivitySettings = () => {
    if (showActivitySettings !== null) {
      setActivities(prev => prev.map(activity =>
        activity.id === showActivitySettings
          ? { ...activity, settings: activitySettings }
          : activity
      ))
      setShowActivitySettings(null)
      setActivitySettings(defaultActivitySettings)
    }
  }

  const cancelActivitySettings = () => {
    setShowActivitySettings(null)
    setActivitySettings(defaultActivitySettings)
  }

  // Load activity settings when opening the modal
  useEffect(() => {
    if (showActivitySettings !== null) {
      const activity = activities.find(a => a.id === showActivitySettings)
      if (activity?.settings) {
        setActivitySettings(activity.settings)
      } else {
        setActivitySettings(defaultActivitySettings)
      }
    }
  }, [showActivitySettings, activities])

  const [showGoalForm, setShowGoalForm] = useState(false)
  const [newGoal, setNewGoal] = useState({
    title: '',
    description: '',
    target: ''
  })

  const [showFoodForm, setShowFoodForm] = useState(false)
  const [newFood, setNewFood] = useState({
    name: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    time: ''
  })

  const [goals, setGoals] = useState<Goal[]>([
    { id: 1, name: 'Daily Steps', description: 'Walk 10,000 steps', progress: 7500, target: 10000, completed: false },
    { id: 2, name: 'Water Intake', description: 'Drink 8 glasses of water', progress: 6, target: 8, completed: false },
    { id: 3, name: 'Reading', description: 'Read for 30 minutes', progress: 30, target: 30, completed: true }
  ])

  const [foodItems, setFoodItems] = useState<FoodItem[]>([
    { id: 1, name: 'Oatmeal with Berries', calories: 320, protein: 12, carbs: 54, fat: 8, time: '08:00' },
    { id: 2, name: 'Grilled Chicken Salad', calories: 450, protein: 35, carbs: 15, fat: 28, time: '12:30' },
    { id: 3, name: 'Apple with Almonds', calories: 190, protein: 6, carbs: 25, fat: 12, time: '15:30' }
  ])

  const totalCalories = foodItems.reduce((sum, item) => sum + item.calories, 0)
  const totalProtein = foodItems.reduce((sum, item) => sum + item.protein, 0)
  const totalCarbs = foodItems.reduce((sum, item) => sum + item.carbs, 0)
  const totalFat = foodItems.reduce((sum, item) => sum + item.fat, 0)

  const toggleActivity = (id: number) => {
    setActivities(prev => prev.map(activity =>
      activity.id === id ? { ...activity, completed: !activity.completed } : activity
    ))
  }

  const addActivity = () => {
    if (newActivity.name && newActivity.duration && newActivity.time) {
      const activity: Activity = {
        id: Date.now(),
        name: newActivity.name,
        duration: typeof newActivity.duration === 'number' ? newActivity.duration : parseInt(newActivity.duration),
        completed: false,
        time: newActivity.time
      }
      setActivities(prev => [...prev, activity])
      setNewActivity({ name: '', duration: '', time: '' })
      setShowActivityForm(false)
    }
  }

  const cancelActivityForm = () => {
    setNewActivity({ name: '', duration: '', time: '' })
    setShowActivityForm(false)
  }

  const addGoal = () => {
    if (newGoal.title && newGoal.description && newGoal.target) {
      const goal: Goal = {
        id: Date.now(),
        name: newGoal.title,
        description: newGoal.description,
        progress: 0,
        target: parseInt(newGoal.target),
        completed: false
      }
      setGoals(prev => [...prev, goal])
      setNewGoal({ title: '', description: '', target: '' })
      setShowGoalForm(false)
    }
  }

  const onChangeGoal = (field: keyof typeof newGoal, value: string) => {
    setNewGoal(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const cancelGoalForm = () => {
    setNewGoal({ title: '', description: '', target: '' })
    setShowGoalForm(false)
  }

  const addFood = () => {
    if (newFood.name && newFood.calories && newFood.protein && newFood.carbs && newFood.fat && newFood.time) {
      const foodItem: FoodItem = {
        id: Date.now(),
        name: newFood.name,
        calories: parseInt(newFood.calories),
        protein: parseInt(newFood.protein),
        carbs: parseInt(newFood.carbs),
        fat: parseInt(newFood.fat),
        time: newFood.time
      }
      setFoodItems(prev => [...prev, foodItem])
      setNewFood({ name: '', calories: '', protein: '', carbs: '', fat: '', time: '' })
      setShowFoodForm(false)
    }
  }

  const onChangeFood = (field: keyof typeof newFood, value: string) => {
    setNewFood(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const cancelFoodForm = () => {
    setNewFood({ name: '', calories: '', protein: '', carbs: '', fat: '', time: '' })
    setShowFoodForm(false)
  }

  const updateGoalProgress = (id: number, progress: number) => {
    setGoals(prev => prev.map(goal =>
      goal.id === id ? {
        ...goal,
        progress: Math.min(progress, goal.target),
        completed: progress >= goal.target
      } : goal
    ))
  }

  const handleSliderChange = (id: number, value: string) => {
    const progress = parseInt(value)
    updateGoalProgress(id, progress)
  }

  const fetchSelectedDate = useCallback(async () => {
    if (user?.id && selectedDate && cms) {
      try {
        // Fetch daily data for the selected date and user
        const response = await cms.collection('user-dailies').find({
          filters: {
            date: { $eq: selectedDate }
          },
          // populate: ['activities', 'activities.activity', 'goals', 'nutrition']
          populate: { 
            activities: { populate: ['activity'] }, 
            goals: { populate: ['goal'] }, 
            nutrition: { populate: ['nutrition_item'] } 
          }
        })

        if (response.data && response.data.length > 0) {
          const dailyData = response.data[0]

          // Update state with fetched data
            setActivities(dailyData?.activities ?? [])
            setGoals(dailyData?.goals ?? [])
            setFoodItems(dailyData?.nutrition ?? [])
        } else {
          const profileResponse = await cms.collection('user-profiles').find()
          if (profileResponse.data && profileResponse.data.length > 0) {
            const profile = profileResponse.data[0]
            setActivities(profile?.activities ?? [])
            setGoals(profile?.goals ?? [])
            setFoodItems(profile?.nutrition_items ?? [])
          }
        }

        console.log('Fetched data for', selectedDate)
      } catch (error) {
        console.error('Error fetching daily data:', error)
      }
    }
  }, [user?.id, selectedDate, cms])

  const saveSelectedDate = useCallback(async () => {
    if (user?.id && selectedDate && cms) {
      try {
        // Check if daily data already exists
        // const existingData = await cms.find('user-dailies', {
        //   // filters: {
        //   //   $and: [
        //   //     { user: { id: { $eq: user.id } } },
        //   //     { date: { $eq: selectedDate } }
        //   //   ]
        //   // }
        // })

        const dailyData = {
          user: user.id,
          date: selectedDate,
          activities,
          goals,
          food_items: foodItems
        }

        // if (existingData.data && existingData.data.length > 0) {
        //   // Update existing record
        //   await cms.update('users-dailies', existingData.data[0].id, { data: dailyData })
        // } else {
        //   // Create new record
        //   await cms.create('users-dailies', { data: dailyData })
        // }

        console.log('Saved data for', selectedDate)
      } catch (error) {
        console.error('Error saving daily data:', error)
      }
    }
  }, [user?.id, selectedDate, cms, activities, goals, foodItems])

  useEffect(() => {
    if (isAuthenticated) {
      fetchSelectedDate()
    }
  }, [isAuthenticated, fetchSelectedDate])

  // Auto-save when data changes
  // useEffect(() => {
  //   if (isAuthenticated && user?.id) {
  //     const timeoutId = setTimeout(() => {
  //       saveSelectedDate()
  //     }, 2000) // Save 2 seconds after last change

  //     return () => clearTimeout(timeoutId)
  //   }
  // }, [isAuthenticated, user?.id, activities, goals, foodItems, saveSelectedDate])
  
  if (router && !isAuthenticated) {
    router.push('/login')
    return null
  }

  return (
    <Provider value={{
      selectedDate,
      setSelectedDate,

      activities,
      toggleActivity,
      showActivityForm,
      newActivity,
      setNewActivity,
      onChangeActivity,
      addActivity,
      cancelActivityForm,
      setShowActivityForm,
      showActivitySettings,
      setShowActivitySettings,
      selectedActivityForSettings,
      activitySettings,
      onChangeActivitySettings,
      saveActivitySettings,
      cancelActivitySettings,

      goals,
      showGoalForm,
      setShowGoalForm,
      newGoal,
      setNewGoal,
      onChangeGoal,
      addGoal,
      cancelGoalForm,
      handleSliderChange,

      foodItems,
      showFoodForm,
      setShowFoodForm,
      newFood,
      setNewFood,
      onChangeFood,
      addFood,
      cancelFoodForm,
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat
    }}>{children}</Provider>
  )
}

