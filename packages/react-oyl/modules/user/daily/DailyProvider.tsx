import React, { useCallback, useEffect, useState } from 'react'
import { useNavigation } from '@/lib/navigation'
import { context } from './user-daily-context'
import type { 
  TUserDailyData,
  TUserActivityData,
  TUserActivitySettings,
  TUserGoalData,
  TUserNutritionData,
} from '@oyl/all-of/modules'
import useAuth from '@/modules/auth/useAuth'
import { useData } from '@/modules/data'

const Provider = context.Provider

export default function DailyProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth()
  const router = useNavigation()
  const { 
    get: fetchUserDaily,
    // save: saveUserDaily
  } = useData<TUserDailyData, string>('user-dailies')

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [activities, setActivities] = useState<TUserActivityData[]>([
    { id: 1, name: 'DelMe - Morning Workout', duration: 30, completed: false, time: '07:00' },
    { id: 2, name: 'DelMe - Walk the Dog', duration: 15, completed: true, time: '18:30' },
    { id: 3, name: 'DelMe - Meditation', duration: 10, completed: false, time: '20:00' }
  ])

  const [showActivityForm, setShowActivityForm] = useState(false)

  const [activityForm, setActivityForm] = useState<TUserActivityData>({
    name: '',
    duration: '',
    time: ''
  })

  const onChangeActivity = (field: keyof TUserActivityData, value: typeof activityForm[keyof TUserActivityData]) => {
    setActivityForm((prev: TUserActivityData) => ({
      ...prev,
      [field]: value
    }))
  }

  // Activity Settings State
  const [showActivitySettings, setShowActivitySettings] = useState<number | null>(null)
  const [activitySettings, setActivitySettings] = useState<TUserActivitySettings>({})

  const selectedActivityForSettings = activities.find(a => a.id === showActivitySettings) || null

  const onChangeActivitySettings = (field: keyof TUserActivitySettings, value: typeof activitySettings[keyof TUserActivitySettings]) => {
    setActivitySettings((prev: TUserActivitySettings) => ({
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
      setActivitySettings({})
    }
  }

  const cancelActivitySettings = () => {
    setShowActivitySettings(null)
    setActivitySettings({})
  }

  // Load activity settings when opening the modal
  useEffect(() => {
    if (showActivitySettings !== null) {
      const activity = activities.find(a => a.id === showActivitySettings)
      if (activity?.settings) {
        setActivitySettings(activity.settings)
      } else {
        setActivitySettings({})
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

  const [goals, setGoals] = useState<TUserGoalData[]>([
    { id: 1, name: 'Daily Steps', description: 'Walk 10,000 steps', progress: 7500, target: 10000, completed: false },
    { id: 2, name: 'Water Intake', description: 'Drink 8 glasses of water', progress: 6, target: 8, completed: false },
    { id: 3, name: 'Reading', description: 'Read for 30 minutes', progress: 30, target: 30, completed: true }
  ])

  const [foodItems, setFoodItems] = useState<TUserNutritionData[]>([
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
    if (activityForm.name && activityForm.duration && activityForm.time) {
      const activity: TUserActivityData = {
        id: Date.now(),
        name: activityForm.name,
        duration: typeof activityForm.duration === 'number' ? activityForm.duration : parseInt(activityForm.duration),
        completed: false,
        time: activityForm.time
      }
      setActivities(prev => [...prev, activity])
      setActivityForm({})
      setShowActivityForm(false)
    }
  }

  const cancelActivityForm = () => {
    setActivityForm({})
    setShowActivityForm(false)
  }

  const addGoal = () => {
    if (newGoal.title && newGoal.description && newGoal.target) {
      const goal: TUserGoalData = {
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
      const foodItem: TUserNutritionData = {
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

  const fetchSelectedDate = useCallback(() => {
    if (user?.id && selectedDate && fetchUserDaily) {
      fetchUserDaily(selectedDate)
    }
  }, [user?.id, selectedDate, fetchUserDaily])

  useEffect(() => {
    if (fetchUserDaily.data) {
      setActivities(fetchUserDaily.data.activities || [])
      setGoals(fetchUserDaily.data.goals || [])
      setFoodItems(fetchUserDaily.data.foodItems || [])
    }
  }, [fetchUserDaily.data])

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
    router.to('/login')
    return null
  }

  return (
    <Provider value={{
      selectedDate,
      setSelectedDate,

      activities,
      toggleActivity,
      showActivityForm,
      activityForm,
      setActivityForm,
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

