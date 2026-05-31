// packages/react-oyl/modules/user/daily-new/UserDailySyncIndicator.tsx
import { useSyncState } from '@/modules/data'

export default function UserDailySyncIndicator() {
  const { online, pendingCount, lastSyncedAt } = useSyncState()
  const dotColor = !online ? 'bg-gray-400' : pendingCount > 0 ? 'bg-yellow-500' : 'bg-green-500'
  const label = !online
    ? 'Offline'
    : pendingCount > 0
      ? `${pendingCount} pending`
      : lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : 'Synced'

  return (
    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
      <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} aria-hidden />
      <span>{label}</span>
    </div>
  )
}
