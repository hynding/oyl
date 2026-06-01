// packages/react-oyl/modules/user/daily/goals/UserDailyAddGoalForm.tsx
import { useState } from 'react'
import type { TUserGoal } from '@oyl/all-of-oyl/modules'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

export default function UserDailyAddGoalForm({ onClose }: { onClose: () => void }) {
  const { addGoal } = useUserDailyOrchestrator()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [target, setTarget] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [priority, setPriority] = useState<NonNullable<TUserGoal['priority']>>('medium')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await addGoal({
      name: name.trim(),
      category: category || undefined,
      target: target ? Number(target) : undefined,
      target_date: targetDate || undefined,
      priority,
      current_status: 'active',
      progress: 0,
    })
    onClose()
  }

  return (
    <form onSubmit={submit} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
      <input id="goal-name" name="name" type="text" placeholder="Goal name" required value={name} onChange={e => setName(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
      <div className="grid grid-cols-2 gap-2">
        <input id="goal-category" name="category" type="text" placeholder="Category" value={category} onChange={e => setCategory(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
        <select id="goal-priority" name="priority" value={priority} onChange={e => setPriority(e.target.value as typeof priority)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
          <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input id="goal-target" name="target" type="number" placeholder="Target value" value={target} onChange={e => setTarget(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
        <input id="goal-target-date" name="targetDate" type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">Cancel</button>
        <button type="submit" className="px-3 py-1 text-sm rounded bg-indigo-600 text-white">Add goal</button>
      </div>
    </form>
  )
}
