// packages/react-oyl/modules/user/daily/activities/UserDailyActivityLogSheet.tsx
import { UserActivityLogSheet, useUserActivityLogContext } from '@/modules/user/activity-log'

export default function UserDailyActivityLogSheet() {
  const { editingLogId, setEditingLogId, logs, updateLog, removeLog } = useUserActivityLogContext()
  const log = logs.find(l => l.id === editingLogId)

  if (!editingLogId || !log || log.id == null) return null
  const id = log.id

  return (
    <UserActivityLogSheet
      log={log}
      onSave={patch => updateLog(id, patch)}
      onDelete={() => removeLog(id)}
      onClose={() => setEditingLogId(null)}
    />
  )
}
