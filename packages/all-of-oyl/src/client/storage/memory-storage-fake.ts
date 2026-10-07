import type { EnumerableStorage } from '../ports.js'

/** In-memory EnumerableStorage for node-env tests (replaces happy-dom's localStorage). */
export function memoryStorage(seed: Record<string, string> = {}): EnumerableStorage & { clear(): void } {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size },
    clear: () => map.clear(),
  }
}
