// packages/react-oyl/modules/user/daily-new/goals/UserDailyAddMilestoneForm.tsx
import { useState } from 'react'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

export default function UserDailyAddMilestoneForm({ onClose }: { onClose: () => void }) {
  const { goalRows, addMilestone } = useUserDailyOrchestrator()
  const [goalId, setGoalId] = useState<string>(
    goalRows[0]?.goal.id != null ? String(goalRows[0].goal.id) : '',
  )
  const [title, setTitle] = useState('')
  const [targetDate, setTargetDate] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!goalId || !title.trim()) return
    const goal = goalRows.find(r => String(r.goal.id) === goalId)?.goal
    if (!goal) return
    await addMilestone({
      user_goal: goal,
      title: title.trim(),
      target_date: targetDate || undefined,
    })
    onClose()
  }

  return (
    <form onSubmit={submit} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
      <select value={goalId} onChange={e => setGoalId(e.target.value)} required
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
        <option value="">Select goal…</option>
        {goalRows.map(r => (
          <option key={r.goal.id} value={r.goal.id != null ? String(r.goal.id) : ''}>
            {r.goal.name}
          </option>
        ))}
      </select>
      <input type="text" placeholder="Milestone title" required value={title} onChange={e => setTitle(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
      <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">Cancel</button>
        <button type="submit" className="px-3 py-1 text-sm rounded bg-indigo-600 text-white">Add milestone</button>
      </div>
    </form>
  )
}
