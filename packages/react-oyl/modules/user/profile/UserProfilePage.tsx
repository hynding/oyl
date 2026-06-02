import { TimezoneSelect } from './TimezoneSelect'
import { useUserProfile } from './useUserProfile'

export default function UserProfilePage() {
  const { timezone, setTimezone, loading, error } = useUserProfile()
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">User Profile Page</h1>
      <div className="space-y-2">
        <label className="block text-sm font-medium">Timezone</label>
        <TimezoneSelect value={timezone} onChange={setTimezone} />
        <p className="text-sm text-gray-500">
          {loading ? 'Loading…' : `Current: ${timezone}`}
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
