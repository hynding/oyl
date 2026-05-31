// packages/all-of-oyl/modules/user/activity/schedule.ts
import { rrulestr } from 'rrule'
import type { TSchedule } from './schedule-types'

export const matchesDate = (schedule: TSchedule | undefined, date: string): boolean => {
  if (!schedule?.rrule) return false
  const rule = rrulestr(schedule.rrule)
  const start = new Date(`${date}T00:00:00Z`)
  const end = new Date(`${date}T23:59:59Z`)
  return rule.between(start, end, true).length > 0
}

export const describeSchedule = (schedule: TSchedule | undefined): string => {
  if (!schedule?.rrule) return 'No schedule'
  try {
    return rrulestr(schedule.rrule).toText()
  } catch {
    return schedule.rrule
  }
}
