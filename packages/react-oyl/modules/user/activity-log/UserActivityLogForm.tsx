import { useState } from 'react'
import type { TDataId, TUserActivityData } from '@oyl/all-of-oyl/modules'

export type UserActivityLogFormValues = {
  user_activity: TUserActivityData
  value?: number
  unit?: string
  note?: string
  mood?: number
}

type Props = {
  activities: TUserActivityData[]
  onSubmit: (values: UserActivityLogFormValues) => void | Promise<void>
  onCancel: () => void
  initialActivityId?: TDataId
  submitLabel?: string
  className?: string
}

export default function UserActivityLogForm({
  activities,
  onSubmit,
  onCancel,
  initialActivityId,
  submitLabel = 'Log',
  className = 'p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3',
}: Props) {
  const initialId =
    initialActivityId != null
      ? String(initialActivityId)
      : activities[0]?.id != null
        ? String(activities[0].id)
        : ''
  const [activityId, setActivityId] = useState<string>(initialId)
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState('')
  const [note, setNote] = useState('')
  const [mood, setMood] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activityId) return
    const activity = activities.find(a => String(a.id) === activityId)
    if (!activity) return
    await onSubmit({
      user_activity: activity,
      value: value ? Number(value) : undefined,
      unit: unit || undefined,
      note: note || undefined,
      mood: mood ? Number(mood) : undefined,
    })
  }

  return (
    <form onSubmit={submit} className={className}>
      <select
        value={activityId}
        onChange={e => setActivityId(e.target.value)}
        required
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      >
        <option value="">Select activity…</option>
        {activities.map(a => (
          <option key={a.id} value={a.id != null ? String(a.id) : ''}>
            {a.name}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          placeholder="Value"
          value={value}
          onChange={e => setValue(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <input
          type="text"
          placeholder="Unit"
          value={unit}
          onChange={e => setUnit(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>
      <input
        type="text"
        placeholder="Note (optional)"
        value={note}
        onChange={e => setNote(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      />
      <input
        type="number"
        placeholder="Mood (1-5)"
        min={1}
        max={5}
        value={mood}
        onChange={e => setMood(e.target.value)}
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
