/**
 * @typedef {{ runExclusive: (name: string, fn: () => Promise<void>) => Promise<void> }} Lock
 */

/**
 * Cross-tab serializing lock via the Web Locks API; degrades to a no-coordination
 * passthrough where unavailable. @param {Window} win
 * @returns {Lock}
 */
export function createBrowserLock(win) {
  const locks = win.navigator.locks
  if (!locks) return { runExclusive: (_name, fn) => fn() }
  return { runExclusive: (name, fn) => /** @type {Promise<void>} */ (/** @type {unknown} */ (locks.request(name, fn))) }
}
