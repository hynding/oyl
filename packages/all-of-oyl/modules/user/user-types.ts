import type { TDataItem } from "@/modules/data"

export type TUser = {
  username: string
  email: string
}

export type TUserData = TUser & TDataItem