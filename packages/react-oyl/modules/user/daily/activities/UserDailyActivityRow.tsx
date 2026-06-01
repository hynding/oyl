// packages/react-oyl/modules/user/daily/activities/UserDailyActivityRow.tsx
import { useState } from 'react'
import { describeSchedule } from '@oyl/all-of-oyl/modules'
import type { ActivityRow } from '../useUserDailyOrchestrator'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

type Props = { row: ActivityRow }

const progressMet = (p: NonNullable<ActivityRow['progress']>) => {
  if (p.direction === 'min') return p.value >= p.target
  if (p.direction === 'max') return p.value <= p.target
  return p.value === p.target
}

export default function UserDailyActivityRow({ row }: Props) {
  const { toggleDone, openActivitySettings, addLog, selectedDate } = useUserDailyOrchestrator()
  const [expanded, setExpanded] = useState(false)
  const { activity, logs, isDone, progress } = row
  if (activity.id == null) return null

  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3 flex-1">
          <input
            type="checkbox"
            checked={isDone}
            onChange={() => toggleDone(activity)}
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 rounded"
          />
          <div className="flex-1">
            <p className={`font-medium ${isDone ? 'text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
              {activity.name ?? '(unnamed)'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {describeSchedule(activity.schedule)} · {activity.type ?? 'habit'}
            </p>
            {progress && (
              <div className="mt-1">
                <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                  <div
                    className={`h-full ${progressMet(progress) ? 'bg-green-500' : 'bg-indigo-500'}`}
                    style={{ width: `${Math.min(100, (progress.value / Math.max(1, progress.target)) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {progress.value} / {progress.target} {activity.target_unit ?? ''} ({progress.direction})
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
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
          <button onClick={() => setExpanded(e => !e)} className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700">
            {expanded ? 'Hide' : `Logs (${logs.length})`}
          </button>
          <button
            onClick={() => openActivitySettings(activity.id ?? null)}
            aria-label="Settings"
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>
      {expanded && (
        <ul className="mt-2 ml-7 space-y-1 text-xs text-gray-600 dark:text-gray-400">
          {logs.length === 0 && <li>(no logs)</li>}
          {logs.map(l => (
            <li key={l.id ?? l.logged_at}>
              {(l.logged_at ?? '').slice(11, 16)} · {l.value ?? '-'} {l.unit ?? ''} {l.note && `· ${l.note}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
