import type { TDataId } from '@oyl/all-of-oyl/modules'
import type { NutritionRow } from '../orchestrator-utils'
import UserDailyNutritionRow from './UserDailyNutritionRow'

export default function UserDailyNutritionList({
  rows, timezone, onServingsChange, onRemove,
}: {
  rows: NutritionRow[]
  timezone: string
  onServingsChange: (id: TDataId, servings: number) => void
  onRemove: (id: TDataId) => void
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400 py-2">Nothing logged for this date yet.</p>
  }
  return (
    <div className="relative">
      {rows.map(row => (
        <UserDailyNutritionRow
          key={row.log.id}
          row={row}
          timezone={timezone}
          onServingsChange={(s) => row.log.id !== undefined && onServingsChange(row.log.id, s)}
          onRemove={() => row.log.id !== undefined && onRemove(row.log.id)}
        />
      ))}
    </div>
  )
}
