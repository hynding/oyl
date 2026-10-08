import { fallbackId } from '@oyl/all-of-oyl/client'

/** The globalThis-shaped surface the ports read (so unit tests pass fakes). */
export interface GlobalLike {
  crypto?: { randomUUID?: () => string }
  navigator?: { storage?: { estimate?: () => Promise<{ usage?: number; quota?: number }> } }
  __OYL_LIB_BUILD__?: string
}

/**
 * Real browser implementations of the client layer's id/diagnostics seams (the
 * @oyl/all-of-oyl/client defaults are ES-only fallbacks). Port of vanilla's browser-ports.js.
 */
export function browserDataPorts(g: GlobalLike) {
  return {
    newId: (): string => (g.crypto?.randomUUID ? g.crypto.randomUUID() : fallbackId()),
    estimateStorage: async (): Promise<{ usage: number; quota: number } | null> => {
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
