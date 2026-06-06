import type { TDataId } from '@oyl/all-of-oyl/modules'
import type { NutritionRow } from './types'
import UserNutritionRow from './UserNutritionRow'

export default function UserNutritionList({
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
        <UserNutritionRow
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
