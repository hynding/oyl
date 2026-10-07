import type { LockWindow } from '../ports.js'

export type Lock = { runExclusive: (name: string, fn: () => Promise<void>) => Promise<void> }

/**
 * Cross-tab serializing lock via the Web Locks API; degrades to a no-coordination
 * passthrough where unavailable.
 */
export function createBrowserLock(win: LockWindow): Lock {
  const locks = win.navigator.locks
  if (!locks) return { runExclusive: (_name, fn) => fn() }
  return { runExclusive: (name, fn) => locks.request(name, fn) as Promise<void> }
}
