import { TActivity } from "@/modules/activity/activity-tuples"

export interface IUserActivity {
  id: number
  name: string
  duration: number
  completed: boolean
  time?: string
  activity?: TActivity
}