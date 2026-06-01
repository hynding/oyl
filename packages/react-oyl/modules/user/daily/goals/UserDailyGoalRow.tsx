// packages/react-oyl/modules/user/daily/goals/UserDailyGoalRow.tsx
import { useState } from 'react'
import type { GoalRow } from '../useUserDailyOrchestrator'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

type Props = { row: GoalRow }

const priorityColor: Record<string, string> = {
  low: 'bg-gray-200 text-gray-700',
  medium: 'bg-yellow-200 text-yellow-900',
  high: 'bg-red-200 text-red-900',
}

export default function UserDailyGoalRow({ row }: Props) {
  const { setProgress, markGoalComplete, appendGoalNote, toggleMilestone, openGoalSettings } = useUserDailyOrchestrator()
  const { goal, milestones, progressPct, isComplete } = row
  const [expanded, setExpanded] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')

  if (goal.id == null) return null

  const bump = (delta: number) => setProgress(goal.id!, Math.max(0, (goal.progress ?? 0) + delta))

  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-medium ${isComplete ? 'text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
              {goal.name ?? '(unnamed)'}
            </p>
            {goal.priority && <span className={`px-2 text-xs rounded ${priorityColor[goal.priority] ?? ''}`}>{goal.priority}</span>}
            {goal.current_status && <span className="px-2 text-xs rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">{goal.current_status}</span>}
            {goal.target_date && <span className="text-xs text-gray-500">by {goal.target_date.slice(0,10)}</span>}
          </div>
          <div className="mt-1 h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
            <div className="h-full bg-indigo-500" style={{ width: `${progressPct * 100}%` }} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{goal.progress ?? 0} / {goal.target ?? 0}</p>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button onClick={() => bump(-1)} className="w-7 h-7 rounded bg-gray-200 dark:bg-gray-700">-</button>
          <button onClick={() => bump(1)} className="w-7 h-7 rounded bg-gray-200 dark:bg-gray-700">+</button>
          {!isComplete && (
            <button onClick={() => markGoalComplete(goal.id!)} className="px-2 py-1 text-xs rounded bg-green-600 text-white">Done</button>
          )}
          <button onClick={() => setExpanded(e => !e)} className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700">
            {expanded ? 'Hide' : `Milestones (${milestones.length})`}
          </button>
          <button onClick={() => openGoalSettings(goal.id!)} aria-label="Settings"
            className="p-1.5 text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/></svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 ml-2 space-y-2">
          {milestones.length === 0 && <p className="text-xs text-gray-500">No milestones.</p>}
          {milestones.map(m => (
            <div key={m.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={m.completed_at != null} onChange={() => m.id != null && toggleMilestone(m.id)} />
              <span className={m.completed_at ? 'line-through text-gray-500' : 'text-gray-800 dark:text-gray-200'}>{m.title}</span>
              {m.target_date && <span className="text-xs text-gray-500">by {m.target_date.slice(0,10)}</span>}
            </div>
          ))}
          <form
            onSubmit={(e) => { e.preventDefault(); if (noteDraft.trim()) { appendGoalNote(goal.id!, noteDraft.trim()); setNoteDraft('') } }}
            className="flex gap-2 pt-1"
          >
            <input type="text" value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="Add note…"
              className="flex-1 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
            <button type="submit" className="px-2 py-1 text-xs rounded bg-indigo-600 text-white">Save</button>
          </form>
          {goal.note && <p className="text-xs whitespace-pre-wrap text-gray-600 dark:text-gray-400 mt-1">{goal.note}</p>}
        </div>
      )}
    </div>
  )
}
