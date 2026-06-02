import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TNutritionItemData } from '@oyl/all-of-oyl/modules'
import { useNutritionSearch } from './useNutritionSearch'

const recent: TNutritionItemData = {
  id: 1, documentId: 'rec-1',
  name: 'Oatmeal', source: 'user', serving_unit: 'g',
} as TNutritionItemData
const global1: TNutritionItemData = {
  id: 2, documentId: 'glo-1',
  name: 'Oat Milk', source: 'user', serving_unit: 'ml',
} as TNutritionItemData

describe('useNutritionSearch', () => {
  it('returns local-only tier-1 + tier-2 merged, dedup by documentId', async () => {
    const offClient = { searchByQuery: vi.fn(), fetchByBarcode: vi.fn() }
    const cache = { findSearch: vi.fn().mockResolvedValue(null), saveSearch: vi.fn() }
    const fetchGlobals = vi.fn().mockResolvedValue([recent, global1])
    const { result } = renderHook(() => useNutritionSearch({
      query: 'oat',
      recentItems: [recent],
      offClient: offClient as never,
      cache: cache as never,
      fetchGlobals,
      debounceMs: 0,
    }))
    await waitFor(() => expect(result.current.localResults).toHaveLength(2))
    expect(result.current.localResults[0].source).toBe('recent')
    expect(result.current.localResults[1].item.documentId).toBe('glo-1')
    expect(result.current.offResults).toHaveLength(0)
    expect(offClient.searchByQuery).not.toHaveBeenCalled()
  })

  it('searchOff reads cache; cache hit avoids OFF call', async () => {
    const offClient = { searchByQuery: vi.fn(), fetchByBarcode: vi.fn() }
    const cached = [{ code: '1', product_name: 'Cached' }]
    const cache = { findSearch: vi.fn().mockResolvedValue(cached), saveSearch: vi.fn() }
    const { result } = renderHook(() => useNutritionSearch({
      query: 'cached',
      recentItems: [],
      offClient: offClient as never,
      cache: cache as never,
      fetchGlobals: vi.fn().mockResolvedValue([]),
      debounceMs: 0,
    }))
    await waitFor(() => expect(result.current.localResults).toBeDefined())
    await act(async () => { await result.current.searchOff() })
    expect(offClient.searchByQuery).not.toHaveBeenCalled()
    expect(result.current.offResults).toEqual(cached)
  })

  it('cache miss falls through to OFF and writes back', async () => {
    const offResp = [{ code: '2', product_name: 'Fresh' }]
    const offClient = { searchByQuery: vi.fn().mockResolvedValue(offResp), fetchByBarcode: vi.fn() }
    const cache = { findSearch: vi.fn().mockResolvedValue(null), saveSearch: vi.fn() }
    const { result } = renderHook(() => useNutritionSearch({
      query: 'fresh',
      recentItems: [],
      offClient: offClient as never,
      cache: cache as never,
      fetchGlobals: vi.fn().mockResolvedValue([]),
      debounceMs: 0,
    }))
    await waitFor(() => expect(result.current.localResults).toBeDefined())
    await act(async () => { await result.current.searchOff() })
    expect(offClient.searchByQuery).toHaveBeenCalledOnce()
    expect(cache.saveSearch).toHaveBeenCalledWith('fresh', offResp)
    expect(result.current.offResults).toEqual(offResp)
  })

  it('surfaces OFF errors without breaking local results', async () => {
    const offClient = { searchByQuery: vi.fn().mockRejectedValue(new Error('503')), fetchByBarcode: vi.fn() }
    const cache = { findSearch: vi.fn().mockResolvedValue(null), saveSearch: vi.fn() }
    const { result } = renderHook(() => useNutritionSearch({
      query: 'oat',
      recentItems: [recent],
      offClient: offClient as never,
      cache: cache as never,
      fetchGlobals: vi.fn().mockResolvedValue([]),
      debounceMs: 0,
    }))
    await waitFor(() => expect(result.current.localResults).toHaveLength(1))
    await act(async () => { await result.current.searchOff() })
    expect(result.current.offError).toMatch(/503/)
    expect(result.current.localResults).toHaveLength(1)
  })
})
