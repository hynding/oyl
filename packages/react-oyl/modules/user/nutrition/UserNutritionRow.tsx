import { useEffect, useState } from 'react'
import type { NutritionRow } from './types'

function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}

function computeCalories(row: NutritionRow, currentServings: number): number {
  const { log, item } = row
  if (item && item.serving_size != null && item.calories_per_100 != null) {
    return Math.round(currentServings * Number(item.calories_per_100) * Number(item.serving_size) / 100)
  }
  return Math.round(Number(log.calories ?? 0))
}

export default function UserNutritionRow({
  row, timezone, onServingsChange, onRemove,
}: {
  row: NutritionRow
  timezone: string
  onServingsChange: (servings: number) => void
  onRemove: () => void
}) {
  const [servings, setServings] = useState(row.log.servings)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (servings === row.log.servings) return
    const handle = setTimeout(() => onServingsChange(servings), 400)
    return () => clearTimeout(handle)
  }, [servings, onServingsChange, row.log.servings])

  const calories = computeCalories(row, servings)

  return (
    <div className="relative flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800">
      <span className="text-xs text-gray-500 w-12 shrink-0">{formatTime(row.log.date, timezone)}</span>
      <span className="flex-1 truncate">{row.log.name}</span>
      <label className="text-xs text-gray-500">
        <span className="sr-only">Servings</span>
        <input
          type="number" min={0} step={0.5}
          aria-label="servings"
          value={servings}
          onChange={e => setServings(Number(e.target.value))}
          className="w-16 px-1 py-0.5 text-sm border rounded"
        />
      </label>
      <span className="text-sm tabular-nums w-16 text-right">{calories} kcal</span>
      <button aria-label="more" onClick={() => setMenuOpen(o => !o)} className="px-2 py-1">⋯</button>
      {menuOpen && (
        <div role="menu" className="absolute z-10 right-0 top-full bg-white dark:bg-gray-800 border rounded shadow">
          <button role="menuitem" onClick={() => { setMenuOpen(false); setConfirmOpen(true) }} className="px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">Remove</button>
        </div>
      )}
      {confirmOpen && (
        <div className="absolute z-10 right-0 top-full bg-white dark:bg-gray-800 border rounded shadow p-2 flex gap-2">
          <button onClick={() => { setConfirmOpen(false); onRemove() }} className="px-2 py-1 bg-red-600 text-white text-sm">Confirm</button>
          <button onClick={() => setConfirmOpen(false)} className="px-2 py-1 text-sm">Cancel</button>
        </div>
      )}
    </div>
  )
}
