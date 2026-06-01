// packages/react-oyl/modules/user/daily/activities/UserDailyLogActivityForm.tsx
import { useState } from 'react'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

export default function UserDailyLogActivityForm({ onClose }: { onClose: () => void }) {
  const { activityRows, addLog, selectedDate } = useUserDailyOrchestrator()
  const [activityId, setActivityId] = useState<string>(
    activityRows[0]?.activity.id != null ? String(activityRows[0].activity.id) : '',
  )
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState('')
  const [note, setNote] = useState('')
  const [mood, setMood] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activityId) return
    const activity = activityRows.find(r => String(r.activity.id) === activityId)?.activity
    if (!activity) return
    await addLog({
      user_activity: activity,
      logged_at: `${selectedDate}T${new Date().toISOString().slice(11, 19)}Z`,
      value: value ? Number(value) : undefined,
      unit: unit || undefined,
      note: note || undefined,
      mood: mood ? Number(mood) : undefined,
    })
    onClose()
  }

  return (
    <form onSubmit={submit} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
      <select value={activityId} onChange={e => setActivityId(e.target.value)} required
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
        <option value="">Select activity…</option>
        {activityRows.map(r => (
          <option key={r.activity.id} value={r.activity.id != null ? String(r.activity.id) : ''}>
            {r.activity.name}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input type="number" placeholder="Value" value={value} onChange={e => setValue(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
        <input type="text" placeholder="Unit" value={unit} onChange={e => setUnit(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
      </div>
      <input type="text" placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
      <input type="number" placeholder="Mood (1-5)" min={1} max={5} value={mood} onChange={e => setMood(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">Cancel</button>
        <button type="submit" className="px-3 py-1 text-sm rounded bg-indigo-600 text-white">Log</button>
      </div>
    </form>
  )
}
