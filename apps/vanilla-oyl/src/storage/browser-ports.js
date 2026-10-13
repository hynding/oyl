import { fallbackId } from '@oyl/all-of-oyl/client'

/**
 * Real browser implementations of the client layer's id/diagnostics seams. The
 * @oyl/all-of-oyl/client defaults are ES-only fallbacks; main.js passes these in.
 * @param {{
 *   crypto?: { randomUUID?: () => string },
 *   navigator?: { storage?: { estimate?: () => Promise<{ usage?: number, quota?: number }> } },
 *   __OYL_LIB_BUILD__?: string,
 * }} g  globalThis-shaped
 */
export function browserDataPorts(g) {
  return {
    /** @returns {string} */
    newId: () => (g.crypto?.randomUUID ? g.crypto.randomUUID() : fallbackId()),
    /** @returns {Promise<{ usage: number, quota: number } | null>} */
    estimateStorage: async () => {
      const nav = g.navigator
      if (nav?.storage?.estimate) {
        const { usage, quota } = await nav.storage.estimate()
        return { usage: usage ?? 0, quota: quota ?? 0 }
      }
      return null
    },
    build: g.__OYL_LIB_BUILD__ ?? 'dev',
  }
}
