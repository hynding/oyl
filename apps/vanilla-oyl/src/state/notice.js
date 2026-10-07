import { signal } from '@oyl/all-of-oyl/client'

/** A single transient app notice (boot/sync errors). */
export function createNoticeState() {
  const notice = signal(/** @type {string | null} */ (null))
  return {
    notice,
    /** @param {string} m */
    show: (m) => notice.set(m),
    clear: () => notice.set(null),
  }
}
