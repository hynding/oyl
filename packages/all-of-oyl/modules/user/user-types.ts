import type { TDataItem } from "../data"

export type TUser = {
  username: string
  email: string
}

export type TUserData = TUser & TDataItem