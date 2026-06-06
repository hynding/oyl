import type { TUserGoalData } from '@oyl/all-of-oyl/modules'
import PageShell from '@/modules/app/PageShell'
import {
  UserGoalProvider,
  UserGoalRow,
  UserGoalsList,
  useUserGoalContext,
} from '@/modules/user/goal'
import {
  UserGoalMilestoneProvider,
  useUserGoalMilestoneContext,
} from '@/modules/user/goal-milestone'

function deriveProgressPct(goal: TUserGoalData): number {
  const raw = goal.progress ?? 0
  const target = goal.target ?? 0
  return target > 0 ? Math.min(1, raw / target) : 0
}

function deriveIsComplete(goal: TUserGoalData): boolean {
  return goal.current_status === 'completed' || goal.completed_at !== undefined
}

export default function UserGoalsPage() {
  return (
    <UserGoalProvider>
      <UserGoalMilestoneProvider>
        <UserGoalsPageBody />
      </UserGoalMilestoneProvider>
    </UserGoalProvider>
  )
}

export function UserGoalsPageBody() {
  const {
    goals,
    setProgress,
    markComplete,
    appendNote,
    setSettingsGoalId,
  } = useUserGoalContext()
  const { getMilestonesForGoal, toggleMilestone } = useUserGoalMilestoneContext()

  return (
    <PageShell title="My Goals">
      <UserGoalsList
        items={goals}
        emptyMessage="No goals yet."
        renderItem={g => {
          const id = g.id
          if (id == null) return null
          return (
            <UserGoalRow
              key={id}
              goal={g}
              milestones={getMilestonesForGoal(id)}
              progressPct={deriveProgressPct(g)}
              isComplete={deriveIsComplete(g)}
              onSetProgress={value => setProgress(id, value)}
              onMarkComplete={() => markComplete(id)}
              onToggleMilestone={toggleMilestone}
              onAppendNote={text => appendNote(id, text)}
              onOpenSettings={setSettingsGoalId}
            />
          )
        }}
      />
    </PageShell>
  )
}
