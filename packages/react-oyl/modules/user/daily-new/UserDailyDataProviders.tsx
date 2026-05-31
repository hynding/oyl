import React from 'react'
import UserDailyProvider from './UserDailyProvider'
import { UserActivityProvider } from '@/modules/user/activity'
import { UserActivityLogProvider } from '@/modules/user/activity-log'
import { UserGoalProvider } from '@/modules/user/goal'
import { UserGoalMilestoneProvider } from '@/modules/user/goal-milestone'

export default function UserDailyDataProviders({ children }: { children: React.ReactNode }) {
  return (
    <UserDailyProvider>
      <UserActivityProvider>
        <UserActivityLogProvider>
          <UserGoalProvider>
            <UserGoalMilestoneProvider>
              {children}
            </UserGoalMilestoneProvider>
          </UserGoalProvider>
        </UserActivityLogProvider>
      </UserActivityProvider>
    </UserDailyProvider>
  )
}
