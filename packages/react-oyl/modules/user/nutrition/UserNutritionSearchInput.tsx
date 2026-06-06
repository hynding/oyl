import { useEffect, useState } from 'react'
import type { LocalResult, OFFProductSummary } from '@/modules/nutrition/openfoodfacts'

type Selection =
  | { kind: 'local'; result: LocalResult }
  | { kind: 'off'; product: OFFProductSummary }

type Props = {
  localResults: LocalResult[]
  offResults: OFFProductSummary[]
  offLoading: boolean
  offError: string | null
  onQueryChange: (query: string) => void
  onSelect: (selection: Selection) => void
  onSearchOff: () => void
}

function Badge({ children, label }: { children: React.ReactNode; label: string }) {
  return <span aria-label={label} className="inline-block text-[10px] px-1 rounded bg-gray-200 dark:bg-gray-700">{children}</span>
}

function nutriColor(g: 'a'|'b'|'c'|'d'|'e'): string {
  const map: Record<'a'|'b'|'c'|'d'|'e', string> = { a: 'bg-green-600 text-white', b: 'bg-lime-600 text-white', c: 'bg-yellow-500 text-black', d: 'bg-orange-600 text-white', e: 'bg-red-600 text-white' }
  return map[g]
}

export default function UserNutritionSearchInput({
  localResults, offResults, offLoading, offError, onQueryChange, onSelect, onSearchOff,
}: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => { onQueryChange(query) }, [query, onQueryChange])

  return (
    <div className="relative w-full">
      <input
        type="text" placeholder="Search foods…"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-800"
      />
      {open && query.length > 0 && (
        <div className="absolute z-10 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border rounded shadow max-h-80 overflow-auto">
          {localResults.map(r => {
            const item = r.item
            return (
              <button key={item.documentId} type="button" onClick={() => onSelect({ kind: 'local', result: r })} className="w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-700 border-b">
                <div className="flex items-center gap-2">
                  {item.image_url && <img src={item.image_url} alt="" className="w-8 h-8 object-cover rounded" />}
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.name}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      {item.brand && <span className="truncate">{item.brand}</span>}
                      {item.package_quantity && <span>· {item.package_quantity}</span>}
                      {item.nutri_score && <Badge label={`Nutri-Score ${item.nutri_score.toUpperCase()}`}><span className={`px-1 ${nutriColor(item.nutri_score)}`}>{item.nutri_score.toUpperCase()}</span></Badge>}
                      {item.nova_group != null && <Badge label={`NOVA ${item.nova_group}`}>NOVA {item.nova_group}</Badge>}
                    </div>
                    {item.allergens && item.allergens.length > 0 && (
                      <div className="text-xs text-amber-700 dark:text-amber-400">Contains: {item.allergens.join(', ')}</div>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
          {offError && <div className="p-2 text-sm text-red-600">{offError}</div>}
          {offLoading && <div className="p-2 text-sm text-gray-500">Searching OpenFoodFacts…</div>}
          {offResults.map(p => (
            <button key={p.code} type="button" onClick={() => onSelect({ kind: 'off', product: p })} className="w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-700 border-b">
              <div className="flex items-center gap-2">
                {p.image_front_small_url && <img src={p.image_front_small_url} alt="" className="w-8 h-8 object-cover rounded" />}
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.product_name ?? p.code}</div>
                  <div className="text-xs text-gray-500">{p.brands}</div>
                </div>
              </div>
            </button>
          ))}
          {!offLoading && offResults.length === 0 && (
            <button type="button" onClick={onSearchOff} className="w-full text-left p-2 text-sm text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-700">
              Search OpenFoodFacts for &ldquo;{query}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  )
}
