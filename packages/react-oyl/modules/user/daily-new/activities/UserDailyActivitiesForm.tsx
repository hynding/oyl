import {
  UserActivityForm,
  useUserActivityContext,
} from '@/modules/user/activity'

export default function UserDailyActivitiesForm() {
  const { activity, addActivity, cancelActivityForm } = useUserActivityContext()
  return (
    <UserActivityForm
      name={activity?.name ?? ''}
      duration={activity?.duration ?? 0}
      time={activity?.time ?? ''}
      onSubmit={addActivity}
      onCancel={cancelActivityForm}
    />
  )
}
