// packages/react-oyl/modules/user/daily/useUserDailyOrchestrator.ts
import type { TDataId, TUserActivityData, TUserGoalData, TUserGoalMilestoneData, TUserActivityLogData } from '@oyl/all-of-oyl/modules'
import { useMemo } from 'react'
import { useUserDailyContext } from './user-daily-context'
import { useUserActivityContext } from '../activity/user-activity-context'
import { useUserActivityLogContext } from '../activity-log/user-activity-log-context'
import { useUserGoalContext } from '../goal/user-goal-context'
import { useUserGoalMilestoneContext } from '../goal-milestone/user-goal-milestone-context'
import { useSyncState } from '../../data'
import { filterActivitiesForDate, filterGoalsForDate } from './orchestrator-utils'

// ---------------------------------------------------------------------------
// Derived row shapes
// ---------------------------------------------------------------------------

export type ActivityRow = {
  activity: TUserActivityData
  logs: TUserActivityLogData[]
  isDone: boolean
  progress?: { value: number; target: number; direction: 'min' | 'max' | 'exact' }
}

export type GoalRow = {
  goal: TUserGoalData
  milestones: TUserGoalMilestoneData[]
  progressPct: number
  isComplete: boolean
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useUserDailyOrchestrator() {
  // -- contexts ---------------------------------------------------------------
  const { selectedDate, setSelectedDate, userDailyData } = useUserDailyContext()

  const {
    activities,
    addActivity,
    settingsActivityId,
    setSettingsActivityId,
  } = useUserActivityContext()

  const logs = useUserActivityLogContext()
  const { getLogsForActivity, addLog, updateLog, removeLog } = logs

  const {
    goals,
    addGoal,
    updateGoal,
    setProgress,
    markComplete,
    appendNote,
    settingsGoalId,
    setSettingsGoalId,
  } = useUserGoalContext()

  const milestones = useUserGoalMilestoneContext()
  const { getMilestonesForGoal, addMilestone, toggleMilestone } = milestones

  const syncState = useSyncState()

  // -- derive filtered activity rows ------------------------------------------

  // The daily record pins specific activities and goals; everything else is
  // filtered from the full context lists by schedule / status.
  const pinnedActivities = userDailyData.activities
  const pinnedGoals = userDailyData.goals

  const todayActivities = useMemo(
    () => filterActivitiesForDate(activities, pinnedActivities as Array<TUserActivityData | TDataId>, selectedDate),
    [activities, pinnedActivities, selectedDate],
  )
  const todayGoals = useMemo(
    () => filterGoalsForDate(goals, pinnedGoals as Array<TUserGoalData | TDataId>, selectedDate),
    [goals, pinnedGoals, selectedDate],
  )

  // Fix 4: destructure stable function references to avoid re-running memo on
  // every render (context objects are new references each render, functions are stable).
  const activityRows: ActivityRow[] = useMemo(() => {
    return todayActivities.map(activity => {
      const acLogs = activity.id !== undefined
        ? getLogsForActivity(activity.id, selectedDate)
        : []

      // A task/habit is "done" when at least one log exists for today.
      const isDone = acLogs.length > 0

      // Fix 2: progress is the structured shape per plan; guard on target_value + target_direction.
      let progress: ActivityRow['progress'] | undefined
      if (activity.target_value != null && activity.target_direction) {
        const sum = acLogs.reduce((acc, l) => acc + (l.value ?? 0), 0)
        progress = { value: sum, target: activity.target_value, direction: activity.target_direction }
      }

      return { activity, logs: acLogs, isDone, progress }
    })
  }, [todayActivities, getLogsForActivity, selectedDate])

  // -- derive filtered goal rows ----------------------------------------------

  const goalRows: GoalRow[] = useMemo(() => {
    return todayGoals.map(goal => {
      const goalMilestones = goal.id !== undefined ? getMilestonesForGoal(goal.id) : []

      // Fix 3: progressPct is a fraction [0, 1], not a percentage.
      const rawProgress = goal.progress ?? 0
      const target = goal.target ?? 0
      const progressPct = target > 0 ? Math.min(1, rawProgress / target) : 0

      const isComplete = goal.current_status === 'completed' || goal.completed_at !== undefined

      return { goal, milestones: goalMilestones, progressPct, isComplete }
    })
  }, [todayGoals, getMilestonesForGoal])

  // -- activity mutators ------------------------------------------------------

  function openActivitySettings(id: TDataId | null) {
    setSettingsActivityId(id)
  }

  async function toggleDone(activity: TUserActivityData) {
    if (activity.id === undefined) return
    const activityLogs = getLogsForActivity(activity.id, selectedDate)
    if (activityLogs.length > 0) {
      // Already logged — remove the first log to toggle off.
      const firstLog = activityLogs[0]
      if (firstLog.id !== undefined) {
        await removeLog(firstLog.id)
      }
    } else {
      // Not yet logged — add a minimal log for today.
      await addLog({
        user_activity: activity,
        logged_at: `${selectedDate}T00:00:00.000Z`,
        value: 1,
      })
    }
  }

  // -- goal mutators ----------------------------------------------------------

  function openGoalSettings(id: TDataId | null) {
    setSettingsGoalId(id)
  }

  async function markGoalComplete(id: TDataId) {
    await markComplete(id)
  }

  async function appendGoalNote(id: TDataId, text: string) {
    await appendNote(id, text)
  }

  // -- expose -----------------------------------------------------------------

  return {
    // date
    selectedDate,
    setSelectedDate,

    // sync
    syncState,

    // rows
    activityRows,
    goalRows,

    // activity mutators
    addActivity,
    addLog,
    toggleDone,
    updateLog,
    removeLog,
    openActivitySettings,
    settingsActivityId,

    // goal mutators
    addGoal,
    updateGoal,
    setProgress,
    appendGoalNote,
    markGoalComplete,
    addMilestone,
    toggleMilestone,
    openGoalSettings,
    settingsGoalId,

    // raw logs (available if consumers need them)
    logs,
  }
}
