// packages/react-oyl/modules/user/activity/useUserActivityState.ts
import { useState } from 'react'
import type { TDataId } from '@oyl/all-of-oyl/modules'

export function useUserActivityState() {
  const [showAddActivityForm, setShowAddActivityForm] = useState(false)
  const [settingsActivityId, setSettingsActivityId] = useState<TDataId | null>(null)
  return { showAddActivityForm, setShowAddActivityForm, settingsActivityId, setSettingsActivityId }
}
