import { useEffect, useState } from 'react'
import type {
  TSchedule,
  TUserActivity,
  TUserActivityData,
  TUserGoalData,
} from '@oyl/all-of-oyl/modules'
import UserActivityScheduleInput from './UserActivityScheduleInput'

type Props = {
  activity: TUserActivityData
  goals: TUserGoalData[]
  onSave: (patch: Partial<TUserActivity>) => void | Promise<void>
  onDelete: () => void | Promise<void>
  onClose: () => void
}

const goalInitialId = (g: TUserActivity['user_goal']): string => {
  if (g == null) return ''
  if (typeof g === 'object' && g.id != null) return String(g.id)
  return String(g)
}

export default function UserActivitySettingsSheet({
  activity,
  goals,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<NonNullable<TUserActivity['type']>>('habit')
  const [status, setStatus] = useState<NonNullable<TUserActivity['current_status']>>('active')
  const [schedule, setSchedule] = useState<TSchedule | undefined>(undefined)
  const [targetValue, setTargetValue] = useState('')
  const [targetUnit, setTargetUnit] = useState('')
  const [targetDirection, setTargetDirection] =
    useState<NonNullable<TUserActivity['target_direction']>>('min')
  const [userGoalId, setUserGoalId] = useState('')

  useEffect(() => {
    setName(activity.name ?? '')
    setType(activity.type ?? 'habit')
    setStatus(activity.current_status ?? 'active')
    setSchedule(activity.schedule)
    setTargetValue(activity.target_value?.toString() ?? '')
    setTargetUnit(activity.target_unit ?? '')
    setTargetDirection(activity.target_direction ?? 'min')
    setUserGoalId(goalInitialId(activity.user_goal))
  }, [activity])

  const save = async () => {
    await onSave({
      name,
      type,
      current_status: status,
      schedule,
      target_value: targetValue ? Number(targetValue) : undefined,
      target_unit: targetUnit || undefined,
      target_direction: targetValue ? targetDirection : undefined,
      user_goal: userGoalId ? Number(userGoalId) : undefined,
    })
    onClose()
  }

  const del = async () => {
    await onDelete()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-lg p-6 w-full max-w-md space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Activity settings</h3>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name"
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={type}
            onChange={e => setType(e.target.value as typeof type)}
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="habit">Habit</option>
            <option value="task">Task</option>
            <option value="event">Event</option>
            <option value="metric">Metric</option>
          </select>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as typeof status)}
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <UserActivityScheduleInput value={schedule} onChange={setSchedule} />
        <div className="grid grid-cols-3 gap-2">
          <input
            type="number"
            value={targetValue}
            onChange={e => setTargetValue(e.target.value)}
            placeholder="Target"
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          <input
            type="text"
            value={targetUnit}
            onChange={e => setTargetUnit(e.target.value)}
            placeholder="Unit"
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          <select
            value={targetDirection}
            onChange={e => setTargetDirection(e.target.value as typeof targetDirection)}
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="min">&ge;</option>
            <option value="max">&le;</option>
            <option value="exact">=</option>
          </select>
        </div>
        <select
          value={userGoalId}
          onChange={e => setUserGoalId(e.target.value)}
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">(no linked goal)</option>
          {goals.map(g => (
            <option key={g.id} value={g.id !== undefined ? String(g.id) : ''}>
              {g.name}
            </option>
          ))}
        </select>
        <div className="flex justify-between">
          <button onClick={del} className="px-3 py-1 text-sm rounded bg-red-600 text-white">
            Delete
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">
              Cancel
            </button>
            <button onClick={save} className="px-3 py-1 text-sm rounded bg-indigo-600 text-white">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
