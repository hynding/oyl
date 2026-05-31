// packages/react-oyl/modules/user/daily-new/activities/UserDailyActivities.tsx
import { useState } from 'react'
import { Section } from '@oyl/storybook-oyl'
import UserDailyActivitiesList from './UserDailyActivitiesList'
import UserDailyAddActivityForm from './UserDailyAddActivityForm'
import UserDailyLogActivityForm from './UserDailyLogActivityForm'
import UserDailyActivityLogSheet from './UserDailyActivityLogSheet'
import UserDailyActivitySettingsSheet from './UserDailyActivitySettingsSheet'

export default function UserDailyActivities() {
  const [showAdd, setShowAdd] = useState(false)
  const [showLog, setShowLog] = useState(false)

  return (
    <Section title="Activities">
      <UserDailyActivitiesList />
      <div className="flex gap-2 mt-3">
        <button onClick={() => setShowAdd(s => !s)} className="px-3 py-1 text-sm rounded bg-indigo-600 text-white">
          {showAdd ? 'Hide' : 'Add activity'}
        </button>
        <button onClick={() => setShowLog(s => !s)} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">
          {showLog ? 'Hide' : 'Log activity'}
        </button>
      </div>
      {showAdd && <div className="mt-3"><UserDailyAddActivityForm onClose={() => setShowAdd(false)} /></div>}
      {showLog && <div className="mt-3"><UserDailyLogActivityForm onClose={() => setShowLog(false)} /></div>}
      <UserDailyActivityLogSheet />
      <UserDailyActivitySettingsSheet />
    </Section>
  )
}
