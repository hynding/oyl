// packages/react-oyl/modules/user/daily/activities/UserDailyActivityRow.tsx
import { UserActivityRow } from '@/modules/user/activity'
import type { ActivityRow } from '../useUserDailyOrchestrator'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

type Props = { row: ActivityRow }

export default function UserDailyActivityRow({ row }: Props) {
  const { toggleDone, openActivitySettings, addLog, selectedDate } = useUserDailyOrchestrator()
  const { activity, logs, isDone, progress } = row
  if (activity.id == null) return null

  const nameClassName = isDone
    ? 'text-gray-500 line-through'
    : 'text-gray-900 dark:text-gray-100'

  return (
    <UserActivityRow
      activity={activity}
      logs={logs}
      progress={progress}
      onOpenSettings={openActivitySettings}
      nameClassName={nameClassName}
      leadingControl={
        <input
          type="checkbox"
          checked={isDone}
          onChange={() => toggleDone(activity)}
          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 rounded"
        />
      }
      trailingActions={
        <button
          onClick={() => addLog({
            user_activity: activity,
            logged_at: `${selectedDate}T00:00:00.000Z`,
            value: 1,
          })}
          className="px-2 py-1 text-xs rounded bg-indigo-600 text-white"
        >
          Log
        </button>
      }
    />
  )
}
