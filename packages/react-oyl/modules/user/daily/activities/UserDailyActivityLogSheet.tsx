// packages/react-oyl/modules/user/daily/activities/UserDailyActivityLogSheet.tsx
import { useEffect, useState } from 'react'
import { useUserActivityLogContext } from '@/modules/user/activity-log'

export default function UserDailyActivityLogSheet() {
  const { editingLogId, setEditingLogId, logs, updateLog, removeLog } = useUserActivityLogContext()
  const log = logs.find(l => l.id === editingLogId)
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState('')
  const [note, setNote] = useState('')
  const [mood, setMood] = useState('')

  useEffect(() => {
    if (log) {
      setValue(log.value?.toString() ?? '')
      setUnit(log.unit ?? '')
      setNote(log.note ?? '')
      setMood(log.mood?.toString() ?? '')
    }
  }, [log])

  if (!editingLogId || !log) return null

  const close = () => setEditingLogId(null)
  const save = async () => {
    if (log.id == null) return close()
    await updateLog(log.id, {
      value: value ? Number(value) : undefined,
      unit: unit || undefined,
      note: note || undefined,
      mood: mood ? Number(mood) : undefined,
    })
    close()
  }
  const del = async () => {
    if (log.id != null) await removeLog(log.id)
    close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={close}>
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Edit log</h3>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" placeholder="Value" value={value} onChange={e => setValue(e.target.value)}
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
          <input type="text" placeholder="Unit" value={unit} onChange={e => setUnit(e.target.value)}
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
        </div>
        <textarea placeholder="Note" value={note} onChange={e => setNote(e.target.value)}
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" rows={3} />
        <input type="number" placeholder="Mood (1-5)" min={1} max={5} value={mood} onChange={e => setMood(e.target.value)}
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
        <div className="flex justify-between">
          <button onClick={del} className="px-3 py-1 text-sm rounded bg-red-600 text-white">Delete</button>
          <div className="flex gap-2">
            <button onClick={close} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">Cancel</button>
            <button onClick={save} className="px-3 py-1 text-sm rounded bg-indigo-600 text-white">Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
