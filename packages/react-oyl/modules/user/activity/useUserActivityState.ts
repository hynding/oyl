import { useEffect, useState } from 'react'
import type {
  TUserActivityData,
  TUserActivitySettings,
} from '@oyl/all-of-oyl/modules'

type UseUserActivityStateArgs = {
  activities: TUserActivityData[]
  setActivities: React.Dispatch<React.SetStateAction<TUserActivityData[]>>
}

export function useUserActivityState({ activities, setActivities }: UseUserActivityStateArgs) {
  const [activity, setActivity] = useState<TUserActivityData | null>(null)
  const [showActivityForm, setShowActivityForm] = useState(false)

  const [showActivitySettings, setShowActivitySettings] = useState<number | null>(null)
  const [activitySettings, setActivitySettings] = useState<TUserActivitySettings>({})

  const selectedActivityForSettings = activities.find(a => a.id === showActivitySettings) || null

  const onChangeActivity = (field: keyof TUserActivityData, value: TUserActivityData[keyof TUserActivityData]) => {
    setActivity((prev) => ({
      ...(prev ?? {} as TUserActivityData),
      [field]: value,
    }))
  }

  const onChangeActivitySettings = (
    field: keyof TUserActivitySettings,
    value: TUserActivitySettings[keyof TUserActivitySettings],
  ) => {
    setActivitySettings((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const saveActivitySettings = () => {
    if (showActivitySettings !== null) {
      setActivities(prev => prev.map(a =>
        a.id === showActivitySettings ? { ...a, settings: activitySettings } : a
      ))
      setShowActivitySettings(null)
      setActivitySettings({})
    }
  }

  const cancelActivitySettings = () => {
    setShowActivitySettings(null)
    setActivitySettings({})
  }

  useEffect(() => {
    if (showActivitySettings !== null) {
      const found = activities.find(a => a.id === showActivitySettings)
      setActivitySettings(found?.settings ?? {})
    }
  }, [showActivitySettings, activities])

  const toggleActivity = (id: number) => {
    setActivities(prev => prev.map(a =>
      a.id === id ? { ...a, completed: !a.completed } : a
    ))
  }

  const addActivity = (payload: { name: string; duration: number; time: string }) => {
    if (!payload.name || !payload.duration || !payload.time) return
    const next: TUserActivityData = {
      id: Date.now(),
      name: payload.name,
      duration: payload.duration,
      completed: false,
      time: payload.time,
    }
    setActivities(prev => [...prev, next])
    setActivity(null)
    setShowActivityForm(false)
  }

  const cancelActivityForm = () => {
    setActivity(null)
    setShowActivityForm(false)
  }

  return {
    activity,
    setActivity,
    activities,
    toggleActivity,
    showActivityForm,
    setActivityForm: setActivity,
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
  }
}
