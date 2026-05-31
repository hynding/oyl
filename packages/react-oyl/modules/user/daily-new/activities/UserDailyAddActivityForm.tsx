// packages/react-oyl/modules/user/daily-new/activities/UserDailyAddActivityForm.tsx
import { useState } from 'react'
import type { TSchedule, TUserActivity } from '@oyl/all-of-oyl/modules'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'
import { useUserGoalContext } from '@/modules/user/goal'
import { UserActivityScheduleInput } from '@/modules/user/activity'

export default function UserDailyAddActivityForm({ onClose }: { onClose: () => void }) {
  const { addActivity } = useUserDailyOrchestrator()
  const { goals } = useUserGoalContext()
  const [name, setName] = useState('')
  const [type, setType] = useState<NonNullable<TUserActivity['type']>>('habit')
  const [schedule, setSchedule] = useState<TSchedule | undefined>(undefined)
  const [targetValue, setTargetValue] = useState<string>('')
  const [targetUnit, setTargetUnit] = useState('')
  const [targetDirection, setTargetDirection] = useState<NonNullable<TUserActivity['target_direction']>>('min')
  const [userGoalId, setUserGoalId] = useState<string>('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await addActivity({
      name: name.trim(),
      type,
      schedule,
      current_status: 'active',
      target_value: targetValue ? Number(targetValue) : undefined,
      target_unit: targetUnit || undefined,
      target_direction: targetValue ? targetDirection : undefined,
      user_goal: userGoalId ? Number(userGoalId) : undefined,
    })
    onClose()
  }

  return (
    <form onSubmit={submit} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
      <input type="text" placeholder="Activity name" required value={name} onChange={e => setName(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
      <div className="grid grid-cols-2 gap-2">
        <select value={type} onChange={e => setType(e.target.value as typeof type)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
          <option value="habit">Habit</option><option value="task">Task</option>
          <option value="event">Event</option><option value="metric">Metric</option>
        </select>
        <select value={userGoalId} onChange={e => setUserGoalId(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
          <option value="">(no linked goal)</option>
          {goals.map(g => <option key={g.id} value={g.id !== undefined ? String(g.id) : ''}>{g.name}</option>)}
        </select>
      </div>
      <UserActivityScheduleInput value={schedule} onChange={setSchedule} />
      <div className="grid grid-cols-3 gap-2">
        <input type="number" placeholder="Target value" value={targetValue} onChange={e => setTargetValue(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
        <input type="text" placeholder="Unit" value={targetUnit} onChange={e => setTargetUnit(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
        <select value={targetDirection} onChange={e => setTargetDirection(e.target.value as typeof targetDirection)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
          <option value="min">At least</option><option value="max">At most</option><option value="exact">Exactly</option>
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">Cancel</button>
        <button type="submit" className="px-3 py-1 text-sm rounded bg-indigo-600 text-white">Add activity</button>
      </div>
    </form>
  )
}
