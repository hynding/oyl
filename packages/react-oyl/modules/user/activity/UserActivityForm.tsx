import { useState } from 'react'
import type { TDataId, TSchedule, TUserActivity, TUserGoalData } from '@oyl/all-of-oyl/modules'
import UserActivityScheduleInput from './UserActivityScheduleInput'

export type UserActivityFormValues = {
  name: string
  type: NonNullable<TUserActivity['type']>
  schedule?: TSchedule
  target_value?: number
  target_unit?: string
  target_direction?: NonNullable<TUserActivity['target_direction']>
  user_goal?: TDataId
  current_status: NonNullable<TUserActivity['current_status']>
}

type Props = {
  initialValues?: Partial<UserActivityFormValues>
  goals: TUserGoalData[]
  onSubmit: (values: UserActivityFormValues) => void | Promise<void>
  onCancel: () => void
  submitLabel?: string
  className?: string
}

export default function UserActivityForm({
  initialValues,
  goals,
  onSubmit,
  onCancel,
  submitLabel = 'Add activity',
  className = 'p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3',
}: Props) {
  const init = initialValues ?? {}
  const [name, setName] = useState<string>(init.name ?? '')
  const [type, setType] = useState<NonNullable<TUserActivity['type']>>(init.type ?? 'habit')
  const [schedule, setSchedule] = useState<TSchedule | undefined>(init.schedule)
  const [targetValue, setTargetValue] = useState<string>(init.target_value?.toString() ?? '')
  const [targetUnit, setTargetUnit] = useState<string>(init.target_unit ?? '')
  const [targetDirection, setTargetDirection] = useState<NonNullable<TUserActivity['target_direction']>>(
    init.target_direction ?? 'min',
  )
  const [userGoalId, setUserGoalId] = useState<string>(init.user_goal != null ? String(init.user_goal) : '')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await onSubmit({
      name: name.trim(),
      type,
      schedule,
      current_status: init.current_status ?? 'active',
      target_value: targetValue ? Number(targetValue) : undefined,
      target_unit: targetUnit || undefined,
      target_direction: targetValue ? targetDirection : undefined,
      user_goal: userGoalId ? Number(userGoalId) : undefined,
    })
  }

  return (
    <form onSubmit={submit} className={className}>
      <input
        id="activity-name"
        name="name"
        type="text"
        placeholder="Activity name"
        required
        value={name}
        onChange={e => setName(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          id="activity-type"
          name="type"
          value={type}
          onChange={e => setType(e.target.value as typeof type)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="habit">Habit</option>
          <option value="task">Task</option>
          <option value="event">Event</option>
          <option value="metric">Metric</option>
        </select>
        <select
          id="activity-goal"
          name="userGoalId"
          value={userGoalId}
          onChange={e => setUserGoalId(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="">(no linked goal)</option>
          {goals.map(g => (
            <option key={g.id} value={g.id !== undefined ? String(g.id) : ''}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      <UserActivityScheduleInput value={schedule} onChange={setSchedule} />
      <div className="grid grid-cols-3 gap-2">
        <input
          id="activity-target-value"
          name="targetValue"
          type="number"
          placeholder="Target value"
          value={targetValue}
          onChange={e => setTargetValue(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <input
          id="activity-target-unit"
          name="targetUnit"
          type="text"
          placeholder="Unit"
          value={targetUnit}
          onChange={e => setTargetUnit(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <select
          id="activity-target-direction"
          name="targetDirection"
          value={targetDirection}
          onChange={e => setTargetDirection(e.target.value as typeof targetDirection)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="min">At least</option>
          <option value="max">At most</option>
          <option value="exact">Exactly</option>
        </select>
      </div>
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
