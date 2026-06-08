// packages/react-oyl/modules/user/daily/UserDailySyncIndicator.tsx
import { useSyncState } from '@/modules/data'

export default function UserDailySyncIndicator() {
  const { online, pendingCount, lastSyncedAt, lastError } = useSyncState()

  const dotColor = lastError
    ? 'bg-red-500'
    : !online
      ? 'bg-gray-400'
      : pendingCount > 0
        ? 'bg-yellow-500'
        : 'bg-green-500'

  const label = lastError
    ? `Save failed: ${lastError.message}`
    : !online
      ? 'Offline'
      : pendingCount > 0
        ? `${pendingCount} pending`
        : lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : 'Synced'

  const textColor = lastError ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'

  return (
    <div className={`flex items-center gap-2 text-xs ${textColor}`}>
      <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} aria-hidden />
      <span>{label}</span>
    </div>
  )
}
