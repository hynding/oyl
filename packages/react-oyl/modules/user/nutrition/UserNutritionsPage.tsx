import { useState } from 'react'
import type { TNutritionItemData } from '@oyl/all-of-oyl/modules'
import PageShell from '@/modules/app/PageShell'
import {
  UserNutritionItemRow,
  UserNutritionItemsList,
  UserNutritionLogForm,
  UserNutritionProvider,
  useUserNutritionContext,
  useUserPantry,
} from '@/modules/user/nutrition'
import { useUserProfile } from '@/modules/user/profile/useUserProfile'

function todayInTimezone(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const y = parts.find(p => p.type === 'year')?.value ?? ''
  const m = parts.find(p => p.type === 'month')?.value ?? ''
  const d = parts.find(p => p.type === 'day')?.value ?? ''
  return `${y}-${m}-${d}`
}

export default function UserNutritionsPage() {
  return (
    <UserNutritionProvider>
      <UserNutritionsPageBody />
    </UserNutritionProvider>
  )
}

export function UserNutritionsPageBody() {
  const { addNutrition } = useUserNutritionContext()
  const { timezone } = useUserProfile()
  const tz = timezone || 'UTC'
  const pantry = useUserPantry()
  const [picked, setPicked] = useState<TNutritionItemData | null>(null)
  const today = todayInTimezone(tz)

  return (
    <PageShell title="My Nutrition">
      <UserNutritionItemsList
        items={pantry}
        emptyMessage="Nothing in your pantry yet — log a food on the Daily page and it'll show up here."
        renderItem={entry => (
          <UserNutritionItemRow
            key={entry.item.documentId}
            item={entry.item}
            lastLoggedAt={entry.lastLoggedAt}
            logCount={entry.logCount}
            timezone={tz}
            onLogAgain={setPicked}
          />
        )}
      />
      {picked && (
        <UserNutritionLogForm
          item={picked}
          selectedDate={today}
          onSubmit={async ({ servings, datetime }) => {
            await addNutrition({
              nutrition_item: picked,
              date: datetime,
              servings,
              name: picked.name,
            })
            setPicked(null)
          }}
          onCancel={() => setPicked(null)}
        />
      )}
    </PageShell>
  )
}
