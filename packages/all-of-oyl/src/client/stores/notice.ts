import { signal } from '../reactive/signal.js'

/** A single transient app notice (boot/sync errors). */
export function createNoticeState() {
  const notice = signal(null as string | null)
  return {
    notice,
    show: (m: string) => notice.set(m),
    clear: () => notice.set(null),
  }
}
