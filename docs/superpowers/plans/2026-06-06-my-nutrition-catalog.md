# /my/nutrition catalog page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only `/my/nutrition` catalog page in `@oyl/react-oyl` that lists every nutrition item the user has ever logged ("pantry") and offers a "Log again" shortcut into the existing `UserNutritionLogForm`.

**Architecture:** A new page component composes a small set of new item-level primitives (`UserNutritionItemRow`, `UserNutritionItemsList`, plus a `useUserPantry` hook driven by a new `derivePantryItems` helper alongside the existing `dedupRecentItemsFrom`). The page wraps `UserNutritionProvider` and uses `useUserProfile`'s timezone to compute today's date for the log-again flow — no dependency on the daily orchestrator.

**Tech Stack:** React 19, react-router 7, Vite, Vitest, Testing Library, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-06-06-my-nutrition-catalog-design.md`

**Concrete APIs (verified against current code):**

- `useUserNutritionContext()` → `{ nutritions: TUserNutritionData[], addNutrition(input): Promise<void>, updateNutrition(id, patch): Promise<void>, removeNutrition(id): Promise<void> }`
- `useUserProfile()` → `{ documentId, timezone: string, loading, error, setTimezone }`
- `UserNutritionLogForm` props: `{ item: TNutritionItemData, selectedDate: string, onSubmit: ({ servings, datetime }) => void, onCancel: () => void }`. Submit produces `{ servings, datetime: `${selectedDate}T${time}:00.000Z` }`.
- Existing `dedupRecentItemsFrom(logs, limit): TNutritionItemData[]` in `useRecentNutritionItems.ts` — keep as-is; `derivePantryItems` is a sibling helper.
- `TNutritionItem` fields used by the row: `name`, `brand`, `nutri_score: 'a'|'b'|'c'|'d'|'e'|null`, `nova_group: 1|2|3|4|null`, `allergens: string[]|null`, `image_url: string|null`.

---

### Task 1: `derivePantryItems` helper + tests

**Files:**
- Modify: `packages/react-oyl/modules/user/nutrition/useRecentNutritionItems.ts`
- Modify: `packages/react-oyl/modules/user/nutrition/useRecentNutritionItems.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/react-oyl/modules/user/nutrition/useRecentNutritionItems.test.ts` (after the existing `describe('dedupRecentItemsFrom', ...)` block). Add the new import at the top of the file, alongside the existing `dedupRecentItemsFrom`:

```ts
import { dedupRecentItemsFrom, derivePantryItems } from './useRecentNutritionItems'
```

Then append at the end of the file:

```ts
describe('derivePantryItems', () => {
  it('returns empty array for empty logs', () => {
    expect(derivePantryItems([])).toEqual([])
  })

  it('aggregates logCount and lastLoggedAt per item across multiple logs', () => {
    const logs = [
      mk('a', '2026-06-01T08:00:00.000Z'),
      mk('a', '2026-06-03T08:00:00.000Z'),
      mk('a', '2026-06-02T08:00:00.000Z'),
      mk('b', '2026-06-04T08:00:00.000Z'),
    ]
    const result = derivePantryItems(logs)
    expect(result).toHaveLength(2)
    const a = result.find(e => e.item.documentId === 'a')!
    const b = result.find(e => e.item.documentId === 'b')!
    expect(a.logCount).toBe(3)
    expect(a.lastLoggedAt).toBe('2026-06-03T08:00:00.000Z')
    expect(b.logCount).toBe(1)
    expect(b.lastLoggedAt).toBe('2026-06-04T08:00:00.000Z')
  })

  it('sorts entries by lastLoggedAt descending', () => {
    const logs = [
      mk('older', '2026-05-01T08:00:00.000Z'),
      mk('newest', '2026-06-10T08:00:00.000Z'),
      mk('middle', '2026-06-01T08:00:00.000Z'),
    ]
    const result = derivePantryItems(logs)
    expect(result.map(e => e.item.documentId)).toEqual(['newest', 'middle', 'older'])
  })

  it('filters out soft-deleted logs', () => {
    const live = mk('a', '2026-06-02T08:00:00.000Z')
    const deleted = { ...mk('a', '2026-06-03T08:00:00.000Z'), deleted_at: '2026-06-03T09:00:00.000Z' } as TUserNutritionData
    const result = derivePantryItems([live, deleted])
    expect(result).toHaveLength(1)
    expect(result[0].logCount).toBe(1)
    expect(result[0].lastLoggedAt).toBe('2026-06-02T08:00:00.000Z')
  })

  it('filters out logs with missing or malformed nutrition_item', () => {
    const ok = mk('a', '2026-06-03T08:00:00.000Z')
    const nullItem = { ...mk('b', '2026-06-04T08:00:00.000Z'), nutrition_item: null as unknown as TNutritionItemData }
    const noDocId = { ...mk('c', '2026-06-05T08:00:00.000Z'), nutrition_item: { id: 99, name: 'no docId' } as unknown as TNutritionItemData }
    const result = derivePantryItems([ok, nullItem, noDocId])
    expect(result).toHaveLength(1)
    expect(result[0].item.documentId).toBe('a')
  })
})
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/nutrition/useRecentNutritionItems.test.ts`
Expected: 5 FAIL with "derivePantryItems is not a function" or "no export named derivePantryItems".

- [ ] **Step 3: Implement `derivePantryItems` and export the entry type**

Edit `packages/react-oyl/modules/user/nutrition/useRecentNutritionItems.ts`. Add the new type and helper above (or below) the existing `dedupRecentItemsFrom`:

```ts
export type PantryEntry = {
  item: TNutritionItemData
  lastLoggedAt: string
  logCount: number
}

export function derivePantryItems(logs: TUserNutritionData[]): PantryEntry[] {
  const groups = new Map<string, { item: TNutritionItemData; lastLoggedAt: string; logCount: number }>()
  for (const log of logs) {
    if (log.deleted_at) continue
    const item = log.nutrition_item
    if (!item || typeof item !== 'object' || !('documentId' in item) || !item.documentId) continue
    const docId = item.documentId
    const existing = groups.get(docId)
    if (!existing) {
      groups.set(docId, { item: item as TNutritionItemData, lastLoggedAt: log.date, logCount: 1 })
    } else {
      existing.logCount += 1
      if (existing.lastLoggedAt < log.date) {
        existing.lastLoggedAt = log.date
        existing.item = item as TNutritionItemData
      }
    }
  }
  return Array.from(groups.values()).sort((a, b) => b.lastLoggedAt.localeCompare(a.lastLoggedAt))
}
```

- [ ] **Step 4: Run the test file to verify all tests pass**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/nutrition/useRecentNutritionItems.test.ts`
Expected: PASS (2 existing + 5 new = 7 tests).

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @oyl/react-oyl exec tsc -b --noEmit`
Expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
git add packages/react-oyl/modules/user/nutrition/useRecentNutritionItems.ts \
  packages/react-oyl/modules/user/nutrition/useRecentNutritionItems.test.ts
git commit -m "feat(react): derivePantryItems helper for nutrition catalog"
```

---

### Task 2: `useUserPantry` hook

**Files:**
- Create: `packages/react-oyl/modules/user/nutrition/useUserPantry.ts`
- Create: `packages/react-oyl/modules/user/nutrition/useUserPantry.test.tsx`
- Modify: `packages/react-oyl/modules/user/nutrition/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/react-oyl/modules/user/nutrition/useUserPantry.test.tsx
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { TUserNutritionData, TNutritionItemData } from '@oyl/all-of-oyl/modules'
import { useUserPantry } from './useUserPantry'

const nutritions: TUserNutritionData[] = [
  {
    id: 1, documentId: 'log-1', date: '2026-06-02T08:00:00.000Z', servings: 1, name: 'Oatmeal', user: 1,
    nutrition_item: { documentId: 'i-oat', id: 1, name: 'Oatmeal', serving_unit: 'g', source: 'user' } as TNutritionItemData,
  } as TUserNutritionData,
  {
    id: 2, documentId: 'log-2', date: '2026-06-04T08:00:00.000Z', servings: 1, name: 'Banana', user: 1,
    nutrition_item: { documentId: 'i-ban', id: 2, name: 'Banana', serving_unit: 'g', source: 'user' } as TNutritionItemData,
  } as TUserNutritionData,
]

vi.mock('./user-nutrition-context', () => ({
  useUserNutritionContext: () => ({
    nutritions,
    addNutrition: vi.fn(),
    updateNutrition: vi.fn(),
    removeNutrition: vi.fn(),
  }),
}))

describe('useUserPantry', () => {
  it('returns pantry entries sorted by most-recent first', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <>{children}</>
    const { result } = renderHook(() => useUserPantry(), { wrapper })
    expect(result.current.map(e => e.item.documentId)).toEqual(['i-ban', 'i-oat'])
    expect(result.current[0].logCount).toBe(1)
    expect(result.current[1].logCount).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/nutrition/useUserPantry.test.tsx`
Expected: FAIL with "Cannot find module './useUserPantry'".

- [ ] **Step 3: Implement `useUserPantry`**

```ts
// packages/react-oyl/modules/user/nutrition/useUserPantry.ts
import { useMemo } from 'react'
import { useUserNutritionContext } from './user-nutrition-context'
import { derivePantryItems, type PantryEntry } from './useRecentNutritionItems'

export function useUserPantry(): PantryEntry[] {
  const { nutritions } = useUserNutritionContext()
  return useMemo(() => derivePantryItems(nutritions), [nutritions])
}
```

- [ ] **Step 4: Export from the nutrition module barrel**

Read `packages/react-oyl/modules/user/nutrition/index.ts` to confirm the current style (the file uses `export { default as X } from './X'` and `export type { ... }` patterns, no trailing semicolons). Then append:

```ts
export { useUserPantry } from './useUserPantry'
export { derivePantryItems } from './useRecentNutritionItems'
export type { PantryEntry } from './useRecentNutritionItems'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/nutrition/useUserPantry.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @oyl/react-oyl exec tsc -b --noEmit`
Expected: exit 0, no output.

- [ ] **Step 7: Commit**

```bash
git add packages/react-oyl/modules/user/nutrition/useUserPantry.ts \
  packages/react-oyl/modules/user/nutrition/useUserPantry.test.tsx \
  packages/react-oyl/modules/user/nutrition/index.ts
git commit -m "feat(react): useUserPantry hook + barrel exports for pantry derivation"
```

---

### Task 3: `UserNutritionItemsList` generic shell

**Files:**
- Create: `packages/react-oyl/modules/user/nutrition/UserNutritionItemsList.tsx`
- Create: `packages/react-oyl/modules/user/nutrition/UserNutritionItemsList.test.tsx`
- Modify: `packages/react-oyl/modules/user/nutrition/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/react-oyl/modules/user/nutrition/UserNutritionItemsList.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import UserNutritionItemsList from './UserNutritionItemsList'

describe('UserNutritionItemsList', () => {
  it('renders the emptyMessage when items is empty', () => {
    render(
      <UserNutritionItemsList items={[]} emptyMessage="No items yet." renderItem={() => null} />,
    )
    expect(screen.getByText('No items yet.')).toBeInTheDocument()
  })

  it('renders each item via renderItem', () => {
    const items = [{ id: 'a' }, { id: 'b' }]
    render(
      <UserNutritionItemsList
        items={items}
        renderItem={i => <span key={i.id} data-testid={`row-${i.id}`}>{i.id}</span>}
      />,
    )
    expect(screen.getByTestId('row-a')).toBeInTheDocument()
    expect(screen.getByTestId('row-b')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/nutrition/UserNutritionItemsList.test.tsx`
Expected: FAIL with "Cannot find module './UserNutritionItemsList'".

- [ ] **Step 3: Implement `UserNutritionItemsList`**

```tsx
// packages/react-oyl/modules/user/nutrition/UserNutritionItemsList.tsx
import type { ReactNode } from 'react'

type Props<T> = {
  items: T[]
  renderItem: (item: T) => ReactNode
  emptyMessage?: ReactNode
  className?: string
}

const DEFAULT_EMPTY = 'No items.'

export default function UserNutritionItemsList<T>({
  items,
  renderItem,
  emptyMessage = DEFAULT_EMPTY,
  className = 'space-y-3',
}: Props<T>) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
  }
  return <div className={className}>{items.map(renderItem)}</div>
}
```

- [ ] **Step 4: Export from the nutrition module barrel**

Append to `packages/react-oyl/modules/user/nutrition/index.ts`:

```ts
export { default as UserNutritionItemsList } from './UserNutritionItemsList'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/nutrition/UserNutritionItemsList.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/react-oyl/modules/user/nutrition/UserNutritionItemsList.tsx \
  packages/react-oyl/modules/user/nutrition/UserNutritionItemsList.test.tsx \
  packages/react-oyl/modules/user/nutrition/index.ts
git commit -m "feat(react): UserNutritionItemsList generic shell for nutrition catalog"
```

---

### Task 4: `UserNutritionItemRow` primitive

**Files:**
- Create: `packages/react-oyl/modules/user/nutrition/UserNutritionItemRow.tsx`
- Create: `packages/react-oyl/modules/user/nutrition/UserNutritionItemRow.test.tsx`
- Modify: `packages/react-oyl/modules/user/nutrition/index.ts`

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/react-oyl/modules/user/nutrition/UserNutritionItemRow.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TNutritionItemData } from '@oyl/all-of-oyl/modules'
import UserNutritionItemRow from './UserNutritionItemRow'

const baseItem: TNutritionItemData = {
  id: 1, documentId: 'i-1', name: 'Oatmeal', brand: 'Brand', serving_unit: 'g', source: 'user',
  nutri_score: 'b', nova_group: 2, allergens: ['gluten'],
} as TNutritionItemData

const minimalItem: TNutritionItemData = {
  id: 2, documentId: 'i-2', name: 'Plain', serving_unit: 'g', source: 'user',
} as TNutritionItemData

describe('UserNutritionItemRow', () => {
  it('renders name and brand', () => {
    render(<UserNutritionItemRow item={baseItem} timezone="UTC" onLogAgain={vi.fn()} />)
    expect(screen.getByText('Oatmeal')).toBeInTheDocument()
    expect(screen.getByText('Brand')).toBeInTheDocument()
  })

  it('renders Nutri-Score and NOVA badges when present', () => {
    render(<UserNutritionItemRow item={baseItem} timezone="UTC" onLogAgain={vi.fn()} />)
    expect(screen.getByLabelText(/Nutri-Score B/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/NOVA 2/i)).toBeInTheDocument()
  })

  it('omits badges when fields are absent', () => {
    render(<UserNutritionItemRow item={minimalItem} timezone="UTC" onLogAgain={vi.fn()} />)
    expect(screen.queryByLabelText(/Nutri-Score/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/NOVA/i)).not.toBeInTheDocument()
  })

  it('renders lastLoggedAt formatted in the given timezone when provided', () => {
    render(
      <UserNutritionItemRow
        item={baseItem}
        timezone="UTC"
        lastLoggedAt="2026-06-04T08:00:00.000Z"
        onLogAgain={vi.fn()}
      />,
    )
    expect(screen.getByText(/Last logged/i)).toBeInTheDocument()
    expect(screen.getByText(/2026-06-04/)).toBeInTheDocument()
  })

  it('renders logCount when provided', () => {
    render(
      <UserNutritionItemRow item={baseItem} timezone="UTC" logCount={5} onLogAgain={vi.fn()} />,
    )
    expect(screen.getByText(/logged 5 times/i)).toBeInTheDocument()
  })

  it('clicking "Log again" calls onLogAgain with the item', () => {
    const onLogAgain = vi.fn()
    render(<UserNutritionItemRow item={baseItem} timezone="UTC" onLogAgain={onLogAgain} />)
    fireEvent.click(screen.getByRole('button', { name: /log again/i }))
    expect(onLogAgain).toHaveBeenCalledWith(baseItem)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/nutrition/UserNutritionItemRow.test.tsx`
Expected: FAIL with "Cannot find module './UserNutritionItemRow'".

- [ ] **Step 3: Implement `UserNutritionItemRow`**

```tsx
// packages/react-oyl/modules/user/nutrition/UserNutritionItemRow.tsx
import type { TNutritionItemData } from '@oyl/all-of-oyl/modules'

type Props = {
  item: TNutritionItemData
  timezone: string
  lastLoggedAt?: string
  logCount?: number
  onLogAgain: (item: TNutritionItemData) => void
}

function nutriColor(g: 'a'|'b'|'c'|'d'|'e'): string {
  const map: Record<'a'|'b'|'c'|'d'|'e', string> = {
    a: 'bg-green-600 text-white',
    b: 'bg-lime-600 text-white',
    c: 'bg-yellow-500 text-black',
    d: 'bg-orange-600 text-white',
    e: 'bg-red-600 text-white',
  }
  return map[g]
}

function formatDate(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso))
  const y = parts.find(p => p.type === 'year')?.value ?? ''
  const m = parts.find(p => p.type === 'month')?.value ?? ''
  const d = parts.find(p => p.type === 'day')?.value ?? ''
  return `${y}-${m}-${d}`
}

function NutritionBadges({ item }: { item: TNutritionItemData }) {
  return (
    <span className="flex items-center gap-1">
      {item.nutri_score && (
        <span
          aria-label={`Nutri-Score ${item.nutri_score.toUpperCase()}`}
          className={`text-[10px] px-1 rounded ${nutriColor(item.nutri_score)}`}
        >
          {item.nutri_score.toUpperCase()}
        </span>
      )}
      {item.nova_group != null && (
        <span
          aria-label={`NOVA ${item.nova_group}`}
          className="text-[10px] px-1 rounded bg-gray-200 dark:bg-gray-700"
        >
          NOVA {item.nova_group}
        </span>
      )}
    </span>
  )
}

export default function UserNutritionItemRow({
  item, timezone, lastLoggedAt, logCount, onLogAgain,
}: Props) {
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
      {item.image_url && (
        <img src={item.image_url} alt="" className="w-10 h-10 object-cover rounded" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{item.name}</span>
          {item.brand && <span className="text-sm text-gray-500">{item.brand}</span>}
          <NutritionBadges item={item} />
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-2">
          {lastLoggedAt && <span>Last logged {formatDate(lastLoggedAt, timezone)}</span>}
          {logCount != null && <span>· logged {logCount} times</span>}
        </div>
      </div>
      <button
        onClick={() => onLogAgain(item)}
        className="px-3 py-1 text-sm rounded bg-indigo-600 text-white"
      >
        Log again
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Export from the nutrition module barrel**

Append to `packages/react-oyl/modules/user/nutrition/index.ts`:

```ts
export { default as UserNutritionItemRow } from './UserNutritionItemRow'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/nutrition/UserNutritionItemRow.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @oyl/react-oyl exec tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/react-oyl/modules/user/nutrition/UserNutritionItemRow.tsx \
  packages/react-oyl/modules/user/nutrition/UserNutritionItemRow.test.tsx \
  packages/react-oyl/modules/user/nutrition/index.ts
git commit -m "feat(react): UserNutritionItemRow with badges, last-logged, log-again"
```

---

### Task 5: `UserNutritionsPage` scaffold + list rendering

**Files:**
- Create: `packages/react-oyl/modules/user/nutrition/UserNutritionsPage.tsx`
- Create: `packages/react-oyl/modules/user/nutrition/UserNutritionsPage.test.tsx`
- Modify: `packages/react-oyl/modules/user/nutrition/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/react-oyl/modules/user/nutrition/UserNutritionsPage.test.tsx
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { TDataId, TNutritionItemData, TUserNutritionData } from '@oyl/all-of-oyl/modules'
import UserNutritionsPage from './UserNutritionsPage'

const nutritions: TUserNutritionData[] = [
  {
    id: 1, documentId: 'log-1', date: '2026-06-02T08:00:00.000Z', servings: 1, name: 'Oatmeal', user: 1,
    nutrition_item: { documentId: 'i-oat', id: 1, name: 'Oatmeal', serving_unit: 'g', source: 'user' } as TNutritionItemData,
  } as TUserNutritionData,
  {
    id: 2, documentId: 'log-2', date: '2026-06-04T08:00:00.000Z', servings: 1, name: 'Banana', user: 1,
    nutrition_item: { documentId: 'i-ban', id: 2, name: 'Banana', serving_unit: 'g', source: 'user' } as TNutritionItemData,
  } as TUserNutritionData,
]

const nutritionCtx = {
  nutritions,
  addNutrition: vi.fn(async (_input: Partial<TUserNutritionData>) => {}),
  updateNutrition: vi.fn(async (_id: TDataId, _patch: Partial<TUserNutritionData>) => {}),
  removeNutrition: vi.fn(async (_id: TDataId) => {}),
}

vi.mock('@/modules/user/nutrition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/user/nutrition')>()
  return {
    ...actual,
    useUserNutritionContext: () => nutritionCtx,
    UserNutritionProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  }
})

vi.mock('@/modules/user/profile/useUserProfile', () => ({
  useUserProfile: () => ({
    documentId: 'p-1', timezone: 'UTC', loading: false, error: null, setTimezone: vi.fn(),
  }),
}))

describe('UserNutritionsPage', () => {
  afterEach(() => {
    nutritionCtx.addNutrition.mockClear()
    nutritionCtx.updateNutrition.mockClear()
    nutritionCtx.removeNutrition.mockClear()
  })

  it('renders heading "My Nutrition" and pantry items derived from context', () => {
    render(<UserNutritionsPage />)
    expect(screen.getByRole('heading', { name: 'My Nutrition' })).toBeInTheDocument()
    expect(screen.getByText('Oatmeal')).toBeInTheDocument()
    expect(screen.getByText('Banana')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/nutrition/UserNutritionsPage.test.tsx`
Expected: FAIL with "Cannot find module './UserNutritionsPage'".

- [ ] **Step 3: Implement `UserNutritionsPage` (list-only, no log-again form yet)**

```tsx
// packages/react-oyl/modules/user/nutrition/UserNutritionsPage.tsx
import PageShell from '@/modules/app/PageShell'
import {
  UserNutritionItemRow,
  UserNutritionItemsList,
  UserNutritionProvider,
  useUserNutritionContext,
  useUserPantry,
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
  useUserNutritionContext() // mounted so useUserPantry has the context to read
  const { timezone } = useUserProfile()
  const tz = timezone || 'UTC'
  const pantry = useUserPantry()

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
```

- [ ] **Step 4: Export from the nutrition module barrel**

Append to `packages/react-oyl/modules/user/nutrition/index.ts`:

```ts
export { default as UserNutritionsPage, UserNutritionsPageBody } from './UserNutritionsPage'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/nutrition/UserNutritionsPage.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @oyl/react-oyl exec tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/react-oyl/modules/user/nutrition/UserNutritionsPage.tsx \
  packages/react-oyl/modules/user/nutrition/UserNutritionsPage.test.tsx \
  packages/react-oyl/modules/user/nutrition/index.ts
git commit -m "feat(react): UserNutritionsPage scaffold with pantry list rendering"
```

---

### Task 6: `UserNutritionsPage` log-again flow + empty state test

**Files:**
- Modify: `packages/react-oyl/modules/user/nutrition/UserNutritionsPage.tsx`
- Modify: `packages/react-oyl/modules/user/nutrition/UserNutritionsPage.test.tsx`

- [ ] **Step 1: Add failing tests**

Append inside the `describe('UserNutritionsPage', ...)` block in the existing test file:

```tsx
  it('renders empty state when nutritions is empty', () => {
    const originalLength = nutritions.length
    nutritions.splice(0, nutritions.length)
    try {
      render(<UserNutritionsPage />)
      expect(screen.getByText(/nothing in your pantry yet/i)).toBeInTheDocument()
    } finally {
      // restore fixture for subsequent tests in this file
      nutritions.push(
        {
          id: 1, documentId: 'log-1', date: '2026-06-02T08:00:00.000Z', servings: 1, name: 'Oatmeal', user: 1,
          nutrition_item: { documentId: 'i-oat', id: 1, name: 'Oatmeal', serving_unit: 'g', source: 'user' } as TNutritionItemData,
        } as TUserNutritionData,
        {
          id: 2, documentId: 'log-2', date: '2026-06-04T08:00:00.000Z', servings: 1, name: 'Banana', user: 1,
          nutrition_item: { documentId: 'i-ban', id: 2, name: 'Banana', serving_unit: 'g', source: 'user' } as TNutritionItemData,
        } as TUserNutritionData,
      )
      expect(originalLength).toBe(2)
    }
  })

  it('clicking "Log again" reveals the UserNutritionLogForm with the picked item', () => {
    render(<UserNutritionsPage />)
    fireEvent.click(screen.getAllByRole('button', { name: /log again/i })[0])
    expect(screen.getByRole('button', { name: /^log$/i })).toBeInTheDocument()
  })

  it('submitting the form calls addNutrition with the expected patch and closes the form', async () => {
    render(<UserNutritionsPage />)
    fireEvent.click(screen.getAllByRole('button', { name: /log again/i })[0])
    fireEvent.change(screen.getByLabelText(/servings/i), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /^log$/i }))
    await waitFor(() => expect(nutritionCtx.addNutrition).toHaveBeenCalled())
    const arg = nutritionCtx.addNutrition.mock.calls[0][0]
    expect(arg.servings).toBe(2)
    expect(arg.name).toBeDefined()
    expect(arg.nutrition_item).toBeDefined()
    expect(typeof arg.date).toBe('string')
    expect(screen.queryByRole('button', { name: /^log$/i })).not.toBeInTheDocument()
  })
```

Update the testing-library import at the top of the file from:

```tsx
import { render, screen } from '@testing-library/react'
```

to:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/nutrition/UserNutritionsPage.test.tsx`
Expected: FAIL — no log button visible, addNutrition never called, empty state may or may not appear depending on derivation. Confirm the failures are about the missing form wiring.

- [ ] **Step 3: Wire the log-again flow into the page**

Replace `UserNutritionsPage.tsx` with:

```tsx
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/nutrition/UserNutritionsPage.test.tsx`
Expected: PASS (4 tests — original + empty state + log-again reveal + submit).

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @oyl/react-oyl exec tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/react-oyl/modules/user/nutrition/UserNutritionsPage.tsx \
  packages/react-oyl/modules/user/nutrition/UserNutritionsPage.test.tsx
git commit -m "feat(react): UserNutritionsPage log-again flow + empty state"
```

---

### Task 7: Mount `/my/nutrition` route and verify whole suite

**Files:**
- Modify: `packages/react-oyl/src/main.tsx`

- [ ] **Step 1: Add the route**

Edit `packages/react-oyl/src/main.tsx`. Add an import after the existing `UserGoalsPage` import:

```tsx
import { UserNutritionsPage } from '@/modules/user/nutrition'
```

Add the route inside `<Routes>` immediately above the `my/:settings` route (after the `my/activities` and `my/goals` routes):

```tsx
          <Route path="my/nutrition" element={<ProtectedRoute><UserNutritionsPage /></ProtectedRoute>} />
```

- [ ] **Step 2: Run the full typecheck**

Run: `pnpm --filter @oyl/react-oyl exec tsc -b --noEmit`
Expected: exit 0, no output.

- [ ] **Step 3: Run the full test suite**

Run: `pnpm --filter @oyl/react-oyl test --run`
Expected: all tests PASS. Test file count should be the previous count + 5 (`useUserPantry`, `UserNutritionItemsList`, `UserNutritionItemRow`, `UserNutritionsPage`, and the 5 new `derivePantryItems` tests folded into the existing `useRecentNutritionItems.test.ts` file — that one is unchanged in count, just longer).

- [ ] **Step 4: Commit**

```bash
git add packages/react-oyl/src/main.tsx
git commit -m "feat(react): route /my/nutrition to UserNutritionsPage"
```

---

## Out of scope (per spec)

- Edit and delete on catalog items — defer to follow-up after OFF-shared-data policy is decided.
- Search / filter / sort controls — v1 ships most-recent-first only.
- Manual item creation from `/my/nutrition`.
- Per-item history view.
- Nav link from `AppHomePage` — trivial follow-up that mirrors the `a4171d2` commit.
- Folding daily nutrition totals into the catalog.
- Refactoring `useRecentNutritionItems` to share grouping logic with `derivePantryItems`.
- Extracting `todayInTimezone` / `localDate` to a shared helper module.

## Notes on patterns reused from the activities/goals catalog plan

The page tests use the same partial-mock pattern documented in the `oyl-react-oyl-inversion-pattern` memory and proven on the activity/goal catalog pages:

- `vi.mock('@/modules/user/nutrition', async (importOriginal) => { ... })` with passthrough provider + canned context.
- Typed `vi.fn(async (_arg: T) => {})` signatures so `.mock.calls[0][0]` typechecks under `tsc --noEmit`.
- `afterEach` reset for fixture state that any test mutates.
- A separate `vi.mock` for `useUserProfile` so the timezone is deterministic across runs.

The `UserNutritionsPageBody` is exported as a named export so future tests can mount the body directly without the passthrough-provider mock if that becomes useful. The default-exported `UserNutritionsPage` is what `main.tsx` mounts.
