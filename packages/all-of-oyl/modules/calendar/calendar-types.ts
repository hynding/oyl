import { type TDataItem } from '@/modules/data'

export type TCalendarItem = TDataItem & {
  date?: Date
}

export type TCalendarItemSettings = TDataItem & {
  autoAdd?: boolean
  frequency?: 'daily' | 'specific-days' | 'interval'
  selectedDays?: number[]
  intervalDays?: number
  startDate?: string
  hasEndDate?: boolean
  endDate?: string
}