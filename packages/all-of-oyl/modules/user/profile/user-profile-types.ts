import type { TDataId, TDataItem } from "@/modules/data";
import type { TUser } from "@/modules/user";

export type TUserProfile = {
  user?: TUser | TDataId;
  bio: string;
  avatar_url: string;
}

export type TUserProfileData = TUserProfile & TDataItem;