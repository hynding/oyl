import type { TNutritionItemData } from '@oyl/all-of-oyl/modules'

type Props = {
  item: TNutritionItemData
  timezone: string
  lastLoggedAt?: string
  logCount?: number
  onLogAgain: (item: TNutritionItemData) => void
}

function nutriColor(g: 'a' | 'b' | 'c' | 'd' | 'e'): string {
  const map: Record<'a' | 'b' | 'c' | 'd' | 'e', string> = {
    a: 'bg-green-600 text-white',
    b: 'bg-lime-600 text-white',
    c: 'bg-yellow-500 text-black',
    d: 'bg-orange-600 text-white',
    e: 'bg-red-600 text-white',
  }
  return map[g]
}

function formatDate(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso))
  const y = parts.find(p => p.type === 'year')?.value ?? ''
  const m = parts.find(p => p.type === 'month')?.value ?? ''
  const d = parts.find(p => p.type === 'day')?.value ?? ''
  return `${y}-${m}-${d}`
}

function NutritionBadges({ item }: { item: TNutritionItemData }) {
  return (
    <span className="flex items-center gap-1">
      {item.nutri_score && (
        <span
          aria-label={`Nutri-Score ${item.nutri_score.toUpperCase()}`}
          className={`text-[10px] px-1 rounded ${nutriColor(item.nutri_score)}`}
        >
          {item.nutri_score.toUpperCase()}
        </span>
      )}
      {item.nova_group != null && (
        <span
          aria-label={`NOVA ${item.nova_group}`}
          className="text-[10px] px-1 rounded bg-gray-200 dark:bg-gray-700"
        >
          NOVA {item.nova_group}
        </span>
      )}
    </span>
  )
}

export default function UserNutritionItemRow({
  item, timezone, lastLoggedAt, logCount, onLogAgain,
}: Props) {
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
      {item.image_url && (
        <img src={item.image_url} alt="" className="w-10 h-10 object-cover rounded" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{item.name}</span>
          {item.brand && <span className="text-sm text-gray-500">{item.brand}</span>}
          <NutritionBadges item={item} />
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-2">
          {lastLoggedAt && <span>Last logged {formatDate(lastLoggedAt, timezone)}</span>}
          {logCount != null && <span>· logged {logCount} {logCount === 1 ? 'time' : 'times'}</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onLogAgain(item)}
        className="px-3 py-1 text-sm rounded bg-indigo-600 text-white"
      >
        Log again
      </button>
    </div>
  )
}
