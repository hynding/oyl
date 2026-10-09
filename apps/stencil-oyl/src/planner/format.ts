import type { DayKey } from '@oyl/all-of-oyl'
import { monthDayLabel } from '@oyl/all-of-oyl/format'

/** "Due Jun 13 · 3d ago" for an overdue plan (display-only, so it stays app-side). */
export function overdueBadge(due: DayKey, today: DayKey): string {
  const days = Math.round((Date.parse(today.value) - Date.parse(due.value)) / 86400000)
  return `Due ${monthDayLabel(due)} · ${days}d ago`
}
