import { useEffect, useState } from 'react'
import type { TUserGoal, TUserGoalData } from '@oyl/all-of-oyl/modules'

type Props = {
  goal: TUserGoalData
  goals: TUserGoalData[]
  onSave: (patch: Partial<TUserGoal>) => void | Promise<void>
  onDelete: () => void | Promise<void>
  onClose: () => void
}

const parentInitialId = (g: TUserGoal['parent_user_goal']): string => {
  if (g == null) return ''
  if (typeof g === 'object' && g.id != null) return String(g.id)
  return String(g)
}

export default function UserGoalSettingsSheet({ goal, goals, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [target, setTarget] = useState('')
  const [priority, setPriority] = useState<NonNullable<TUserGoal['priority']>>('medium')
  const [targetDate, setTargetDate] = useState('')
  const [status, setStatus] = useState<NonNullable<TUserGoal['current_status']>>('active')
  const [parentGoalId, setParentGoalId] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    setName(goal.name ?? '')
    setCategory(goal.category ?? '')
    setTarget(goal.target?.toString() ?? '')
    setPriority(goal.priority ?? 'medium')
    setTargetDate(goal.target_date?.slice(0, 10) ?? '')
    setStatus(goal.current_status ?? 'active')
    setParentGoalId(parentInitialId(goal.parent_user_goal))
    setNote(goal.note ?? '')
  }, [goal])

  const save = async () => {
    await onSave({
      name,
      category: category || undefined,
      target: target ? Number(target) : undefined,
      priority,
      target_date: targetDate || undefined,
      current_status: status,
      parent_user_goal: parentGoalId ? Number(parentGoalId) : undefined,
      note: note || undefined,
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
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Goal settings</h3>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name"
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="Category"
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          <input
            type="number"
            value={target}
            onChange={e => setTarget(e.target.value)}
            placeholder="Target"
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={priority}
            onChange={e => setPriority(e.target.value as typeof priority)}
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as typeof status)}
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <input
          type="date"
          value={targetDate}
          onChange={e => setTargetDate(e.target.value)}
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
        <select
          value={parentGoalId}
          onChange={e => setParentGoalId(e.target.value)}
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">(no parent goal)</option>
          {goals
            .filter(g => g.id !== goal.id)
            .map(g => (
              <option key={g.id} value={g.id !== undefined ? String(g.id) : ''}>
                {g.name}
              </option>
            ))}
        </select>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Note"
          rows={4}
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
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
