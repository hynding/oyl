import { useUserActivityContext } from './user-activity-context';

type TUserActivityListProps = {
  className?: string
}

export default function UserActivityList(props: TUserActivityListProps) {
  const { className } = props;
  const { activities, toggleActivity, setShowActivitySettings } = useUserActivityContext();
  return (
    <div className={className}>
      {activities.map(activity => (
        <div key={activity.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex items-center space-x-3 flex-1">
            <input
              type="checkbox"
              checked={activity.completed}
              onChange={() => toggleActivity(activity.id)}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 rounded"
            />
            <div>
              <p className={`font-medium ${activity.completed ? 'text-gray-500 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                {activity?.name ?? activity?.activity?.name ?? 'Activity'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{activity.duration} min • {activity.time}</p>
            </div>
          </div>
          <button
            onClick={() => setShowActivitySettings(activity.id)}
            className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}