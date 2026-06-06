import { useState } from 'react'
import type { TDataId, TUserGoalData } from '@oyl/all-of-oyl/modules'

export type UserGoalMilestoneFormValues = {
  user_goal: TUserGoalData
  title: string
  target_date?: string
}

type Props = {
  goals: TUserGoalData[]
  onSubmit: (values: UserGoalMilestoneFormValues) => void | Promise<void>
  onCancel: () => void
  initialGoalId?: TDataId
  submitLabel?: string
  className?: string
}

export default function UserGoalMilestoneForm({
  goals,
  onSubmit,
  onCancel,
  initialGoalId,
  submitLabel = 'Add milestone',
  className = 'p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3',
}: Props) {
  const initialId =
    initialGoalId != null
      ? String(initialGoalId)
      : goals[0]?.id != null
        ? String(goals[0].id)
        : ''
  const [goalId, setGoalId] = useState<string>(initialId)
  const [title, setTitle] = useState('')
  const [targetDate, setTargetDate] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!goalId || !title.trim()) return
    const goal = goals.find(g => String(g.id) === goalId)
    if (!goal) return
    await onSubmit({
      user_goal: goal,
      title: title.trim(),
      target_date: targetDate || undefined,
    })
  }

  return (
    <form onSubmit={submit} className={className}>
      <select
        value={goalId}
        onChange={e => setGoalId(e.target.value)}
        required
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      >
        <option value="">Select goal…</option>
        {goals.map(g => (
          <option key={g.id} value={g.id != null ? String(g.id) : ''}>
            {g.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Milestone title"
        required
        value={title}
        onChange={e => setTitle(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      />
      <input
        type="date"
        value={targetDate}
        onChange={e => setTargetDate(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">
          Cancel
        </button>
        <button type="submit" className="px-3 py-1 text-sm rounded bg-indigo-600 text-white">
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
