import type { TNutritionItemData } from '@oyl/all-of-oyl/modules'

export default function UserNutritionQuickAdd({ items, onPick }: { items: TNutritionItemData[]; onPick: (item: TNutritionItemData) => void }) {
  if (items.length === 0) return null
  return (
    <div className="flex gap-2 overflow-x-auto py-2">
      {items.map(item => (
        <button
          key={item.documentId}
          onClick={() => onPick(item)}
          className="shrink-0 flex items-center gap-2 px-3 py-1 rounded-full border bg-white dark:bg-gray-800"
        >
          {item.image_url && <img src={item.image_url} alt="" className="w-6 h-6 rounded object-cover" />}
          <span className="text-sm">{item.name}</span>
        </button>
      ))}
    </div>
  )
}
