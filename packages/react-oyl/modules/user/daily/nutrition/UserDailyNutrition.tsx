import { useCallback, useMemo, useState } from 'react'
import { Section } from '@oyl/storybook-oyl'
import type { TNutritionItemData } from '@oyl/all-of-oyl/modules'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'
import { useUserProfile } from '@/modules/user/profile/useUserProfile'
import {
  createOFFClientFromEnv,
  normalizeProduct,
  useNutritionSearch,
} from '@/modules/nutrition/openfoodfacts'
import type { LocalResult, NutritionSearchCache, OFFProductSummary } from '@/modules/nutrition/openfoodfacts'
import { createRemoteClient } from '@/modules/data/useDataRemote'
import useAuth from '@/modules/auth/useAuth'
import UserDailyNutritionTotals from './UserDailyNutritionTotals'
import UserDailyNutritionList from './UserDailyNutritionList'
import UserDailyNutritionQuickAdd from './UserDailyNutritionQuickAdd'
import UserDailyNutritionSearchInput from './UserDailyNutritionSearchInput'
import UserDailyBarcodeButton from './UserDailyBarcodeButton'
import UserDailyAddNutritionForm from './UserDailyAddNutritionForm'

type CachedSearch = { query: string; results: OFFProductSummary[] }

export default function UserDailyNutrition() {
  const {
    selectedDate, nutritionRows, dailyTotals, recentNutritionItems,
    addNutritionLog, updateNutritionServings, removeNutritionLog,
  } = useUserDailyOrchestrator()
  const { timezone } = useUserProfile()
  const tz = timezone || 'UTC'
  const { apiToken } = useAuth()
  const remote = useMemo(() => createRemoteClient(() => apiToken), [apiToken])
  const offClient = useMemo(() => createOFFClientFromEnv(), [])
  const cache: NutritionSearchCache = useMemo(() => ({
    async findSearch(query) {
      const list = await remote.findAll<CachedSearch>('nutrition-searches').catch(() => [])
      return list.find(r => r.query === query)?.results ?? null
    },
    async saveSearch(query, results) {
      await remote.create('nutrition-searches', { query, results })
    },
  }), [remote])

  const fetchGlobals = useCallback(async (q: string): Promise<TNutritionItemData[]> => {
    const params = new URLSearchParams({
      'filters[$or][0][name][$startsWithi]': q,
      'filters[$or][1][brand][$startsWithi]': q,
      'pagination[pageSize]': '20',
    })
    return await remote.findAll<TNutritionItemData>(`nutrition-items?${params.toString()}`).catch(() => [])
  }, [remote])

  const [query, setQuery] = useState('')
  const search = useNutritionSearch({
    query,
    recentItems: recentNutritionItems,
    offClient,
    cache,
    fetchGlobals: (q) => fetchGlobals(q),
  })

  const [picked, setPicked] = useState<TNutritionItemData | null>(null)

  const findOrCreateByBarcode = useCallback(async (barcode: string): Promise<TNutritionItemData | null> => {
    const params = new URLSearchParams({
      'filters[barcode][$eq]': barcode, 'pagination[pageSize]': '1',
    })
    const existing = await remote.findAll<TNutritionItemData>(`nutrition-items?${params.toString()}`).catch(() => [])
    if (existing.length > 0) return existing[0]
    const product = await offClient.fetchByBarcode(barcode, new AbortController().signal).catch(() => null)
    if (!product) return null
    const { columns, data } = normalizeProduct(product)
    return await remote.create<TNutritionItemData>('nutrition-items', { ...columns, data })
  }, [offClient, remote])

  const handleSelect = useCallback(async (selection: { kind: 'local'; result: LocalResult } | { kind: 'off'; product: OFFProductSummary }) => {
    if (selection.kind === 'local') {
      setPicked(selection.result.item)
      return
    }
    const found = await findOrCreateByBarcode(selection.product.code)
    if (found) setPicked(found)
  }, [findOrCreateByBarcode])

  const handleBarcode = useCallback(async (barcode: string) => {
    const found = await findOrCreateByBarcode(barcode)
    if (found) setPicked(found)
  }, [findOrCreateByBarcode])

  const submit = useCallback(async ({ servings, datetime }: { servings: number; datetime: string }) => {
    if (!picked || !picked.documentId) return
    await addNutritionLog({
      nutritionItemDocumentId: picked.documentId,
      servings,
      datetime,
      item: picked,
    })
    setPicked(null)
    setQuery('')
  }, [picked, addNutritionLog])

  return (
    <Section title="Nutrition">
      <UserDailyNutritionTotals totals={dailyTotals} />
      <UserDailyNutritionQuickAdd items={recentNutritionItems} onPick={setPicked} />
      <div className="flex gap-2 mt-2">
        <div className="flex-1">
          <UserDailyNutritionSearchInput
            localResults={search.localResults}
            offResults={search.offResults}
            offLoading={search.offLoading}
            offError={search.offError}
            onQueryChange={setQuery}
            onSelect={handleSelect}
            onSearchOff={search.searchOff}
          />
        </div>
        <UserDailyBarcodeButton onBarcode={handleBarcode} />
      </div>
      {picked && (
        <div className="mt-2">
          <UserDailyAddNutritionForm
            item={picked}
            selectedDate={selectedDate}
            onSubmit={submit}
            onCancel={() => setPicked(null)}
          />
        </div>
      )}
      <div className="mt-3">
        <UserDailyNutritionList
          rows={nutritionRows}
          timezone={tz}
          onServingsChange={updateNutritionServings}
          onRemove={removeNutritionLog}
        />
      </div>
    </Section>
  )
}
