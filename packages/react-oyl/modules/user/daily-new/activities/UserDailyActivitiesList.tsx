import {
  UserActivityItem,
  useUserActivityContext,
} from '@/modules/user/activity'

export default function UserDailyActivitiesList() {
  const { activities, toggleActivity, setShowActivitySettings } = useUserActivityContext()
  return (
    <div className="space-y-3">
      {activities.map(activity => (
        <UserActivityItem
          key={activity.id}
          id={activity.id}
          name={activity.name}
          duration={activity.duration}
          time={activity.time}
          completed={activity.completed}
          onChangeCompleted={toggleActivity}
          onOpenSettings={setShowActivitySettings}
        />
      ))}
    </div>
  )
}
