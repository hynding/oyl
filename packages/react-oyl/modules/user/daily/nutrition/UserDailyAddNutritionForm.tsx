import { useState } from 'react'
import type { TNutritionItemData } from '@oyl/all-of-oyl/modules'

function defaultTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function UserDailyAddNutritionForm({
  item, selectedDate, onSubmit, onCancel,
}: {
  item: TNutritionItemData
  selectedDate: string
  onSubmit: (args: { servings: number; datetime: string }) => void
  onCancel: () => void
}) {
  const [servings, setServings] = useState<number>(1)
  const [time, setTime] = useState<string>(defaultTime())
  const valid = servings > 0

  return (
    <div className="p-3 border rounded bg-white dark:bg-gray-800 space-y-2">
      <div className="font-medium">{item.name}{item.brand ? ` — ${item.brand}` : ''}</div>
      {item.allergens && item.allergens.length > 0 && (
        <div className="text-sm text-amber-700 dark:text-amber-400">Contains: {item.allergens.join(', ')}</div>
      )}
      <div className="flex gap-2 items-center">
        <label className="text-sm">
          Servings <input aria-label="servings" type="number" min={0} step={0.5} value={servings} onChange={e => setServings(Number(e.target.value))} className="w-20 px-1 py-0.5 border rounded ml-1" />
        </label>
        <label className="text-sm">
          Time <input aria-label="time" type="time" value={time} onChange={e => setTime(e.target.value)} className="px-1 py-0.5 border rounded ml-1" />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          disabled={!valid}
          onClick={() => onSubmit({ servings, datetime: `${selectedDate}T${time}:00.000Z` })}
          className="px-3 py-1 rounded bg-indigo-600 text-white disabled:opacity-50"
        >Log</button>
        <button onClick={onCancel} className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700">Cancel</button>
      </div>
    </div>
  )
}
