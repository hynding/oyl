import { 
  UserActivitySettings,
  useUserActivityContext
} from "@/modules/user/activity";

export default function UserDailyActivitiesSettings() {
  const { addActivity } = useUserActivityContext()
  return <UserActivitySettings onSubmit={addActivity} />;
}