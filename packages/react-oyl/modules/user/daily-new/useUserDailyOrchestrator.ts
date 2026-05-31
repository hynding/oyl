// packages/react-oyl/modules/user/daily-new/useUserDailyOrchestrator.ts
import type { TDataId, TUserActivityData, TUserGoalData, TUserGoalMilestoneData, TUserActivityLogData } from '@oyl/all-of-oyl/modules'
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
  progress?: number
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

  const {
    logs,
    getLogsForActivity,
    addLog,
    updateLog,
    removeLog,
  } = useUserActivityLogContext()

  const {
    goals,
    addGoal,
    updateGoal,
    setProgress,
    markComplete,
    appendNote,
    showAddGoalForm: _showAddGoalForm,
    setShowAddGoalForm: _setShowAddGoalForm,
    settingsGoalId,
    setSettingsGoalId,
  } = useUserGoalContext()

  const {
    getMilestonesForGoal,
    addMilestone,
    toggleMilestone,
  } = useUserGoalMilestoneContext()

  const syncState = useSyncState()

  // -- derive filtered activity rows ------------------------------------------

  // The daily record pins specific activities and goals; everything else is
  // filtered from the full context lists by schedule / status.
  const pinnedActivities = userDailyData.activities
  const pinnedGoals = userDailyData.goals

  const filteredActivities = filterActivitiesForDate(activities, pinnedActivities as Array<TUserActivityData | TDataId>, selectedDate)

  const activityRows: ActivityRow[] = filteredActivities.map(activity => {
    const activityLogs = activity.id !== undefined
      ? getLogsForActivity(activity.id, selectedDate)
      : []

    // A task/habit is "done" when at least one log exists for today.
    // For metric activities, surface the summed value as progress.
    const isDone = activityLogs.length > 0
    const progress = activity.type === 'metric'
      ? activityLogs.reduce<number>((sum, l) => sum + (l.value ?? 0), 0)
      : undefined

    return { activity, logs: activityLogs, isDone, progress }
  })

  // -- derive filtered goal rows ----------------------------------------------

  const filteredGoals = filterGoalsForDate(goals, pinnedGoals as Array<TUserGoalData | TDataId>, selectedDate)

  const goalRows: GoalRow[] = filteredGoals.map(goal => {
    const milestones = goal.id !== undefined ? getMilestonesForGoal(goal.id) : []

    // progress / target are optional numbers; guard against division by zero.
    const rawProgress = goal.progress ?? 0
    const target = goal.target ?? 0
    const progressPct = target > 0 ? Math.min(100, Math.round((rawProgress / target) * 100)) : 0

    const isComplete = goal.current_status === 'completed' || goal.completed_at !== undefined

    return { goal, milestones, progressPct, isComplete }
  })

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
