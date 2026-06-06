import { useMemo } from 'react'
import PageShell from '@/modules/app/PageShell'
import {
  UserNutritionItemRow,
  UserNutritionItemsList,
  UserNutritionProvider,
  derivePantryItems,
  useUserNutritionContext,
} from '@/modules/user/nutrition'
import { useUserProfile } from '@/modules/user/profile/useUserProfile'

export default function UserNutritionsPage() {
  return (
    <UserNutritionProvider>
      <UserNutritionsPageBody />
    </UserNutritionProvider>
  )
}

export function UserNutritionsPageBody() {
  const { nutritions } = useUserNutritionContext() // mounted so pantry derivation has the context to read
  const { timezone } = useUserProfile()
  const tz = timezone || 'UTC'
  const pantry = useMemo(() => derivePantryItems(nutritions), [nutritions])

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
            onLogAgain={() => {}}
          />
        )}
      />
    </PageShell>
  )
}
