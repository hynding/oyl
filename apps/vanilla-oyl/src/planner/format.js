import { monthDayLabel } from '@oyl/all-of-oyl/format'

/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */

/** "Due Jun 13 · 3d ago" for an overdue plan. @param {DayKey} due @param {DayKey} today @returns {string} */
export function overdueBadge(due, today) {
  const days = Math.round((Date.parse(today.value) - Date.parse(due.value)) / 86400000)
  return `Due ${monthDayLabel(due)} · ${days}d ago`
}
