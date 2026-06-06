import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TNutritionItemData } from '@oyl/all-of-oyl/modules'
import type { OFFProductSummary } from './off-types'
import type { OFFClient } from './openfoodfacts-client'

export type LocalResultSource = 'recent' | 'global'
export type LocalResult = { item: TNutritionItemData; source: LocalResultSource }

export type NutritionSearchCache = {
  findSearch(query: string): Promise<OFFProductSummary[] | null>
  saveSearch(query: string, results: OFFProductSummary[]): Promise<void>
}

export type UseNutritionSearchArgs = {
  query: string
  recentItems: TNutritionItemData[]
  offClient: OFFClient
  cache: NutritionSearchCache
  fetchGlobals: (q: string, signal: AbortSignal) => Promise<TNutritionItemData[]>
  debounceMs?: number
}

function normalize(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ')
}

function prefixMatch(item: TNutritionItemData, query: string): boolean {
  const q = normalize(query)
  if (!q) return false
  const name = (item.name ?? '').toLowerCase()
  return name.startsWith(q)
}

export function useNutritionSearch({ query, recentItems, offClient, cache, fetchGlobals, debounceMs = 200 }: UseNutritionSearchArgs) {
  const [localResults, setLocalResults] = useState<LocalResult[]>([])
  const [offResults, setOffResults] = useState<OFFProductSummary[]>([])
  const [offLoading, setOffLoading] = useState(false)
  const [offError, setOffError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const recentItemsRef = useRef(recentItems)
  const fetchGlobalsRef = useRef(fetchGlobals)
  recentItemsRef.current = recentItems
  fetchGlobalsRef.current = fetchGlobals
  const normalizedQuery = useMemo(() => normalize(query), [query])

  useEffect(() => {
    setOffResults([])
    setOffError(null)
    if (!query) { setLocalResults([]); return }
    const handle = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const tier1 = recentItemsRef.current.filter(i => prefixMatch(i, query))
      const recentIds = new Set(tier1.map(i => i.documentId))
      const globals = await fetchGlobalsRef.current(query, controller.signal).catch(() => [] as TNutritionItemData[])
      const tier2 = globals.filter(g => !recentIds.has(g.documentId))
      if (controller.signal.aborted) return
      setLocalResults([
        ...tier1.map(item => ({ item, source: 'recent' as const })),
        ...tier2.map(item => ({ item, source: 'global' as const })),
      ])
    }, debounceMs)
    return () => clearTimeout(handle)
  }, [query, debounceMs])

  const searchOff = useCallback(async () => {
    if (!normalizedQuery) return
    setOffLoading(true); setOffError(null)
    try {
      const cached = await cache.findSearch(normalizedQuery)
      if (cached) { setOffResults(cached); return }
      const controller = new AbortController()
      const results = await offClient.searchByQuery(normalizedQuery, controller.signal)
      setOffResults(results)
      cache.saveSearch(normalizedQuery, results).catch(() => { /* best-effort */ })
    } catch (err) {
      setOffError(err instanceof Error ? err.message : 'OpenFoodFacts unavailable')
    } finally {
      setOffLoading(false)
    }
  }, [cache, normalizedQuery, offClient])

  return { localResults, offResults, offLoading, offError, searchOff }
}
