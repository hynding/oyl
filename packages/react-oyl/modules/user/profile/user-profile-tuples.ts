import { TActivity } from "@/modules/activity/activity-tuples"
import { TUser } from "@/modules/user/user-tuples"

export type TUserProfile = {
  user: TUser;
  activities: TActivity[];
  goals: unknown[];
  nutrition: unknown[];
}