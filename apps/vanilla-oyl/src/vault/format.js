import { spanLabel } from '@oyl/all-of-oyl/format'

/** "Last contacted 3 months ago" / "Last contacted today" / "Never contacted". @param {number | undefined} days @returns {string} */
export function stalenessLabel(days) {
  if (days === undefined) return 'Never contacted'
  if (days <= 0) return 'Last contacted today'
  if (days === 1) return 'Last contacted yesterday'
  return `Last contacted ${spanLabel(days)} ago`
}
