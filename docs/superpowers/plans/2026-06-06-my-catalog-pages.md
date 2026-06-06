# /my/activities and /my/goals catalog pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two standalone catalog pages at `/my/activities` and `/my/goals` in `@oyl/react-oyl` that consume the inverted domain primitives without any dependency on the daily orchestrator.

**Architecture:** Each page mounts only its own data providers and renders the existing domain primitives (`UserActivitiesList` + `UserActivityRow` + `UserActivityForm` + `UserActivitySettingsSheet`; goal equivalents). Each `*Page` exports a default that wraps providers around a named `*PageBody` so tests can mount the body with mocked contexts.

**Tech Stack:** React 19, react-router 7, Vite, Vitest, Testing Library, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-06-06-my-catalog-pages-design.md`

**Concrete context APIs (verified against current code):**

- `useUserActivityContext()` → `{ activities, addActivity, updateActivity, removeActivity, showAddActivityForm, setShowAddActivityForm, settingsActivityId, setSettingsActivityId }`
- `useUserGoalContext()` → `{ goals, getGoal, addGoal, updateGoal, removeGoal, setProgress, markComplete, appendNote, showAddGoalForm, setShowAddGoalForm, settingsGoalId, setSettingsGoalId }`
- `useUserGoalMilestoneContext()` → `{ milestones, getMilestonesForGoal, addMilestone, toggleMilestone, removeMilestone, reorderMilestones }`

The activity page needs `UserGoalProvider` too because `UserActivityForm` and `UserActivitySettingsSheet` both take a `goals` prop for the goal-linking dropdown.

The goals page needs `UserGoalMilestoneProvider` because `UserGoalRow` takes a `milestones` prop, and computes `progressPct` from `goal.progress / goal.target` and `isComplete` from `goal.current_status === 'completed' || goal.completed_at !== undefined` (same as `useUserDailyOrchestrator.ts:111-116`).

---

### Task 1: PageShell shared chrome

**Files:**
- Create: `packages/react-oyl/modules/app/PageShell.tsx`
- Test: `packages/react-oyl/modules/app/PageShell.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/react-oyl/modules/app/PageShell.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PageShell from './PageShell'

describe('PageShell', () => {
  it('renders title in a heading and children inside', () => {
    render(
      <PageShell title="My Activities">
        <p>child content</p>
      </PageShell>,
    )
    expect(screen.getByRole('heading', { name: 'My Activities' })).toBeInTheDocument()
    expect(screen.getByText('child content')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/react-oyl test --run modules/app/PageShell.test.tsx`
Expected: FAIL with "Cannot find module './PageShell'" or equivalent.

- [ ] **Step 3: Implement PageShell**

```tsx
// packages/react-oyl/modules/app/PageShell.tsx
import type { ReactNode } from 'react'

export default function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-900 py-8">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 space-y-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/react-oyl test --run modules/app/PageShell.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/app/PageShell.tsx packages/react-oyl/modules/app/PageShell.test.tsx
git commit -m "feat(react): add PageShell for standalone catalog pages"
```

---

### Task 2: UserActivitiesPage — providers and list rendering

**Files:**
- Create: `packages/react-oyl/modules/user/activity/UserActivitiesPage.tsx`
- Create: `packages/react-oyl/modules/user/activity/UserActivitiesPage.test.tsx`
- Modify: `packages/react-oyl/modules/user/activity/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/react-oyl/modules/user/activity/UserActivitiesPage.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { TUserActivityData, TUserGoalData } from '@oyl/all-of-oyl/modules'
import UserActivitiesPage from './UserActivitiesPage'

const activities: TUserActivityData[] = [
  { id: 1, documentId: 'a1', name: 'Walk', type: 'habit', current_status: 'active' } as never,
  { id: 2, documentId: 'a2', name: 'Read', type: 'habit', current_status: 'active' } as never,
]

const activityCtx = {
  activities,
  addActivity: vi.fn(async () => {}),
  updateActivity: vi.fn(async () => {}),
  removeActivity: vi.fn(async () => {}),
  showAddActivityForm: false,
  setShowAddActivityForm: vi.fn(),
  settingsActivityId: null,
  setSettingsActivityId: vi.fn(),
}

const goals: TUserGoalData[] = []

const goalCtx = {
  goals,
  getGoal: () => undefined,
  addGoal: vi.fn(async () => {}),
  updateGoal: vi.fn(async () => {}),
  removeGoal: vi.fn(async () => {}),
  setProgress: vi.fn(async () => {}),
  markComplete: vi.fn(async () => {}),
  appendNote: vi.fn(async () => {}),
  showAddGoalForm: false,
  setShowAddGoalForm: vi.fn(),
  settingsGoalId: null,
  setSettingsGoalId: vi.fn(),
}

vi.mock('@/modules/user/activity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/user/activity')>()
  return {
    ...actual,
    useUserActivityContext: () => activityCtx,
    UserActivityProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  }
})

vi.mock('@/modules/user/goal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/user/goal')>()
  return {
    ...actual,
    useUserGoalContext: () => goalCtx,
    UserGoalProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  }
})

describe('UserActivitiesPage', () => {
  it('renders all activities from context under a "My Activities" heading', () => {
    render(<UserActivitiesPage />)
    expect(screen.getByRole('heading', { name: 'My Activities' })).toBeInTheDocument()
    expect(screen.getByText('Walk')).toBeInTheDocument()
    expect(screen.getByText('Read')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/activity/UserActivitiesPage.test.tsx`
Expected: FAIL with "Cannot find module './UserActivitiesPage'".

- [ ] **Step 3: Implement UserActivitiesPage with providers and list body**

```tsx
// packages/react-oyl/modules/user/activity/UserActivitiesPage.tsx
import PageShell from '@/modules/app/PageShell'
import {
  UserActivitiesList,
  UserActivityProvider,
  UserActivityRow,
  useUserActivityContext,
} from '@/modules/user/activity'
import { UserGoalProvider, useUserGoalContext } from '@/modules/user/goal'

export default function UserActivitiesPage() {
  return (
    <UserActivityProvider>
      <UserGoalProvider>
        <UserActivitiesPageBody />
      </UserGoalProvider>
    </UserActivityProvider>
  )
}

export function UserActivitiesPageBody() {
  const { activities, setSettingsActivityId } = useUserActivityContext()
  useUserGoalContext() // mounted so form/sheet have goals available

  return (
    <PageShell title="My Activities">
      <UserActivitiesList
        items={activities}
        emptyMessage="No activities yet."
        renderItem={a => (
          <UserActivityRow
            key={a.id}
            activity={a}
            onOpenSettings={setSettingsActivityId}
          />
        )}
      />
    </PageShell>
  )
}
```

- [ ] **Step 4: Export from index**

Edit `packages/react-oyl/modules/user/activity/index.ts`, append:

```ts
export { default as UserActivitiesPage, UserActivitiesPageBody } from './UserActivitiesPage'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/activity/UserActivitiesPage.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add packages/react-oyl/modules/user/activity/UserActivitiesPage.tsx \
  packages/react-oyl/modules/user/activity/UserActivitiesPage.test.tsx \
  packages/react-oyl/modules/user/activity/index.ts
git commit -m "feat(react): UserActivitiesPage scaffold with list rendering"
```

---

### Task 3: UserActivitiesPage — add-activity flow

**Files:**
- Modify: `packages/react-oyl/modules/user/activity/UserActivitiesPage.tsx`
- Modify: `packages/react-oyl/modules/user/activity/UserActivitiesPage.test.tsx`

- [ ] **Step 1: Add failing tests for add flow**

Append inside the `describe` block in `UserActivitiesPage.test.tsx`:

```tsx
  it('clicking "Add activity" toggles the form open via context', () => {
    activityCtx.setShowAddActivityForm.mockClear()
    render(<UserActivitiesPage />)
    fireEvent.click(screen.getByRole('button', { name: /add activity/i }))
    expect(activityCtx.setShowAddActivityForm).toHaveBeenCalledWith(true)
  })

  it('renders the form when showAddActivityForm is true and submits via addActivity', async () => {
    activityCtx.showAddActivityForm = true
    activityCtx.addActivity.mockClear()
    activityCtx.setShowAddActivityForm.mockClear()
    render(<UserActivitiesPage />)
    fireEvent.change(screen.getByPlaceholderText(/name/i), { target: { value: 'Stretch' } })
    fireEvent.click(screen.getByRole('button', { name: /^add activity$/i }))
    await waitFor(() => expect(activityCtx.addActivity).toHaveBeenCalled())
    expect(activityCtx.addActivity.mock.calls[0][0]).toMatchObject({ name: 'Stretch' })
    expect(activityCtx.setShowAddActivityForm).toHaveBeenCalledWith(false)
    activityCtx.showAddActivityForm = false
  })
```

Add to the imports at the top of the test file:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
```

(Replace the existing `import { render, screen }` line.)

- [ ] **Step 2: Run tests to verify both fail**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/activity/UserActivitiesPage.test.tsx`
Expected: FAIL — no "Add activity" button rendered yet; no form.

- [ ] **Step 3: Implement the add flow in the page body**

Replace `UserActivitiesPageBody` in `UserActivitiesPage.tsx` with:

```tsx
import {
  UserActivitiesList,
  UserActivityForm,
  UserActivityProvider,
  UserActivityRow,
  useUserActivityContext,
} from '@/modules/user/activity'

export function UserActivitiesPageBody() {
  const {
    activities,
    addActivity,
    setSettingsActivityId,
    showAddActivityForm,
    setShowAddActivityForm,
  } = useUserActivityContext()
  const { goals } = useUserGoalContext()

  return (
    <PageShell title="My Activities">
      <UserActivitiesList
        items={activities}
        emptyMessage="No activities yet."
        renderItem={a => (
          <UserActivityRow
            key={a.id}
            activity={a}
            onOpenSettings={setSettingsActivityId}
          />
        )}
      />
      <button
        onClick={() => setShowAddActivityForm(!showAddActivityForm)}
        className="px-3 py-1 text-sm rounded bg-indigo-600 text-white"
      >
        {showAddActivityForm ? 'Cancel' : 'Add activity'}
      </button>
      {showAddActivityForm && (
        <UserActivityForm
          goals={goals}
          onSubmit={async values => {
            await addActivity(values)
            setShowAddActivityForm(false)
          }}
          onCancel={() => setShowAddActivityForm(false)}
        />
      )}
    </PageShell>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/activity/UserActivitiesPage.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/user/activity/UserActivitiesPage.tsx \
  packages/react-oyl/modules/user/activity/UserActivitiesPage.test.tsx
git commit -m "feat(react): UserActivitiesPage add-activity flow"
```

---

### Task 4: UserActivitiesPage — settings sheet (edit / delete)

**Files:**
- Modify: `packages/react-oyl/modules/user/activity/UserActivitiesPage.tsx`
- Modify: `packages/react-oyl/modules/user/activity/UserActivitiesPage.test.tsx`

- [ ] **Step 1: Add failing tests for the settings sheet**

Append inside the `describe`:

```tsx
  it('renders UserActivitySettingsSheet when settingsActivityId matches an activity', () => {
    activityCtx.settingsActivityId = 1
    render(<UserActivitiesPage />)
    expect(screen.getByRole('heading', { name: /activity settings/i })).toBeInTheDocument()
    activityCtx.settingsActivityId = null
  })

  it('sheet Save calls updateActivity with the patch and clears settingsActivityId', async () => {
    activityCtx.settingsActivityId = 1
    activityCtx.updateActivity.mockClear()
    activityCtx.setSettingsActivityId.mockClear()
    render(<UserActivitiesPage />)
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(activityCtx.updateActivity).toHaveBeenCalled())
    expect(activityCtx.updateActivity.mock.calls[0][0]).toBe(1)
    expect(activityCtx.setSettingsActivityId).toHaveBeenCalledWith(null)
    activityCtx.settingsActivityId = null
  })

  it('sheet Delete calls removeActivity and clears settingsActivityId', async () => {
    activityCtx.settingsActivityId = 1
    activityCtx.removeActivity.mockClear()
    activityCtx.setSettingsActivityId.mockClear()
    render(<UserActivitiesPage />)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await waitFor(() => expect(activityCtx.removeActivity).toHaveBeenCalledWith(1))
    expect(activityCtx.setSettingsActivityId).toHaveBeenCalledWith(null)
    activityCtx.settingsActivityId = null
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/activity/UserActivitiesPage.test.tsx`
Expected: FAIL — sheet not rendered; update/remove never called.

- [ ] **Step 3: Wire the sheet into the page body**

Edit `UserActivitiesPage.tsx`. Update the imports:

```tsx
import {
  UserActivitiesList,
  UserActivityForm,
  UserActivityProvider,
  UserActivityRow,
  UserActivitySettingsSheet,
  useUserActivityContext,
} from '@/modules/user/activity'
```

Add inside `UserActivitiesPageBody` after destructuring, replacing the destructure line with:

```tsx
  const {
    activities,
    addActivity,
    updateActivity,
    removeActivity,
    settingsActivityId,
    setSettingsActivityId,
    showAddActivityForm,
    setShowAddActivityForm,
  } = useUserActivityContext()
  const { goals } = useUserGoalContext()
  const editingActivity = activities.find(a => a.id === settingsActivityId) ?? null
```

Render the sheet at the bottom of `PageShell`, after the form block:

```tsx
      {editingActivity && editingActivity.id != null && (
        <UserActivitySettingsSheet
          activity={editingActivity}
          goals={goals}
          onSave={patch => updateActivity(editingActivity.id!, patch)}
          onDelete={() => removeActivity(editingActivity.id!)}
          onClose={() => setSettingsActivityId(null)}
        />
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/activity/UserActivitiesPage.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/user/activity/UserActivitiesPage.tsx \
  packages/react-oyl/modules/user/activity/UserActivitiesPage.test.tsx
git commit -m "feat(react): UserActivitiesPage settings sheet for edit and delete"
```

---

### Task 5: Mount UserActivitiesPage at /my/activities

**Files:**
- Modify: `packages/react-oyl/src/main.tsx`

- [ ] **Step 1: Add the route**

Edit `packages/react-oyl/src/main.tsx`. Add an import after the existing user imports:

```tsx
import { UserActivitiesPage } from '@/modules/user/activity'
```

Add the route inside `<Routes>` immediately above the `my/:settings` route:

```tsx
          <Route path="my/activities" element={<ProtectedRoute><UserActivitiesPage /></ProtectedRoute>} />
```

- [ ] **Step 2: Verify typecheck and tests stay green**

Run: `pnpm --filter @oyl/react-oyl exec tsc -b --noEmit`
Expected: exit 0, no output.

Run: `pnpm --filter @oyl/react-oyl test --run`
Expected: all tests PASS (existing suite + new tests from Tasks 1-4).

- [ ] **Step 3: Commit**

```bash
git add packages/react-oyl/src/main.tsx
git commit -m "feat(react): route /my/activities to UserActivitiesPage"
```

---

### Task 6: UserGoalsPage — providers, list, derivation helper

**Files:**
- Create: `packages/react-oyl/modules/user/goal/UserGoalsPage.tsx`
- Create: `packages/react-oyl/modules/user/goal/UserGoalsPage.test.tsx`
- Modify: `packages/react-oyl/modules/user/goal/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/react-oyl/modules/user/goal/UserGoalsPage.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { TUserGoalData, TUserGoalMilestoneData } from '@oyl/all-of-oyl/modules'
import UserGoalsPage from './UserGoalsPage'

const goals: TUserGoalData[] = [
  { id: 1, documentId: 'g1', name: 'Run 5k', priority: 'medium', current_status: 'active', progress: 2, target: 5 } as never,
  { id: 2, documentId: 'g2', name: 'Read 12 books', priority: 'low', current_status: 'active', progress: 4, target: 12 } as never,
]

const goalCtx = {
  goals,
  getGoal: (id: number) => goals.find(g => g.id === id),
  addGoal: vi.fn(async () => {}),
  updateGoal: vi.fn(async () => {}),
  removeGoal: vi.fn(async () => {}),
  setProgress: vi.fn(async () => {}),
  markComplete: vi.fn(async () => {}),
  appendNote: vi.fn(async () => {}),
  showAddGoalForm: false,
  setShowAddGoalForm: vi.fn(),
  settingsGoalId: null as number | null,
  setSettingsGoalId: vi.fn(),
}

const milestones: TUserGoalMilestoneData[] = []
const milestoneCtx = {
  milestones,
  getMilestonesForGoal: () => [],
  addMilestone: vi.fn(async () => {}),
  toggleMilestone: vi.fn(async () => {}),
  removeMilestone: vi.fn(async () => {}),
  reorderMilestones: vi.fn(async () => {}),
}

vi.mock('@/modules/user/goal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/user/goal')>()
  return {
    ...actual,
    useUserGoalContext: () => goalCtx,
    UserGoalProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  }
})

vi.mock('@/modules/user/goal-milestone', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/user/goal-milestone')>()
  return {
    ...actual,
    useUserGoalMilestoneContext: () => milestoneCtx,
    UserGoalMilestoneProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  }
})

describe('UserGoalsPage', () => {
  it('renders all goals from context under "My Goals"', () => {
    render(<UserGoalsPage />)
    expect(screen.getByRole('heading', { name: 'My Goals' })).toBeInTheDocument()
    expect(screen.getByText('Run 5k')).toBeInTheDocument()
    expect(screen.getByText('Read 12 books')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/goal/UserGoalsPage.test.tsx`
Expected: FAIL with "Cannot find module './UserGoalsPage'".

- [ ] **Step 3: Implement UserGoalsPage with provider tree, list, and derivation**

```tsx
// packages/react-oyl/modules/user/goal/UserGoalsPage.tsx
import type { TUserGoalData } from '@oyl/all-of-oyl/modules'
import PageShell from '@/modules/app/PageShell'
import {
  UserGoalProvider,
  UserGoalRow,
  UserGoalsList,
  useUserGoalContext,
} from '@/modules/user/goal'
import {
  UserGoalMilestoneProvider,
  useUserGoalMilestoneContext,
} from '@/modules/user/goal-milestone'

function deriveProgressPct(goal: TUserGoalData): number {
  const raw = goal.progress ?? 0
  const target = goal.target ?? 0
  return target > 0 ? Math.min(1, raw / target) : 0
}

function deriveIsComplete(goal: TUserGoalData): boolean {
  return goal.current_status === 'completed' || goal.completed_at !== undefined
}

export default function UserGoalsPage() {
  return (
    <UserGoalProvider>
      <UserGoalMilestoneProvider>
        <UserGoalsPageBody />
      </UserGoalMilestoneProvider>
    </UserGoalProvider>
  )
}

export function UserGoalsPageBody() {
  const {
    goals,
    setProgress,
    markComplete,
    appendNote,
    setSettingsGoalId,
  } = useUserGoalContext()
  const { getMilestonesForGoal, toggleMilestone } = useUserGoalMilestoneContext()

  return (
    <PageShell title="My Goals">
      <UserGoalsList
        items={goals}
        emptyMessage="No goals yet."
        renderItem={g => g.id == null ? null : (
          <UserGoalRow
            key={g.id}
            goal={g}
            milestones={getMilestonesForGoal(g.id)}
            progressPct={deriveProgressPct(g)}
            isComplete={deriveIsComplete(g)}
            onSetProgress={value => setProgress(g.id!, value)}
            onMarkComplete={() => markComplete(g.id!)}
            onToggleMilestone={toggleMilestone}
            onAppendNote={text => appendNote(g.id!, text)}
            onOpenSettings={setSettingsGoalId}
          />
        )}
      />
    </PageShell>
  )
}
```

- [ ] **Step 4: Export from index**

Edit `packages/react-oyl/modules/user/goal/index.ts`, append:

```ts
export { default as UserGoalsPage, UserGoalsPageBody } from './UserGoalsPage'
```

- [ ] **Step 5: Check `UserGoalsList` accepts the props used above**

Read `packages/react-oyl/modules/user/goal/UserGoalsList.tsx`. Confirm it follows the same `<T>{ items, renderItem, emptyMessage?, className? }` shape as `UserActivitiesList`. If the prop names differ, adjust the call site to match.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/goal/UserGoalsPage.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 7: Commit**

```bash
git add packages/react-oyl/modules/user/goal/UserGoalsPage.tsx \
  packages/react-oyl/modules/user/goal/UserGoalsPage.test.tsx \
  packages/react-oyl/modules/user/goal/index.ts
git commit -m "feat(react): UserGoalsPage scaffold with list rendering"
```

---

### Task 7: UserGoalsPage — add-goal flow

**Files:**
- Modify: `packages/react-oyl/modules/user/goal/UserGoalsPage.tsx`
- Modify: `packages/react-oyl/modules/user/goal/UserGoalsPage.test.tsx`

- [ ] **Step 1: Add failing tests for the add flow**

Replace the test imports line with:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
```

Append inside the `describe`:

```tsx
  it('clicking "Add goal" toggles the form open via context', () => {
    goalCtx.setShowAddGoalForm.mockClear()
    render(<UserGoalsPage />)
    fireEvent.click(screen.getByRole('button', { name: /add goal/i }))
    expect(goalCtx.setShowAddGoalForm).toHaveBeenCalledWith(true)
  })

  it('renders the form when showAddGoalForm is true and submits via addGoal', async () => {
    goalCtx.showAddGoalForm = true
    goalCtx.addGoal.mockClear()
    goalCtx.setShowAddGoalForm.mockClear()
    render(<UserGoalsPage />)
    fireEvent.change(screen.getByPlaceholderText(/name/i), { target: { value: 'Meditate' } })
    fireEvent.click(screen.getByRole('button', { name: /^add goal$/i }))
    await waitFor(() => expect(goalCtx.addGoal).toHaveBeenCalled())
    expect(goalCtx.addGoal.mock.calls[0][0]).toMatchObject({ name: 'Meditate' })
    expect(goalCtx.setShowAddGoalForm).toHaveBeenCalledWith(false)
    goalCtx.showAddGoalForm = false
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/goal/UserGoalsPage.test.tsx`
Expected: FAIL — no "Add goal" button; no form.

- [ ] **Step 3: Wire the form into the page body**

Edit `UserGoalsPage.tsx`. Update the goal imports to include the form:

```tsx
import {
  UserGoalForm,
  UserGoalProvider,
  UserGoalRow,
  UserGoalsList,
  useUserGoalContext,
} from '@/modules/user/goal'
```

Replace the body's destructure with:

```tsx
  const {
    goals,
    addGoal,
    setProgress,
    markComplete,
    appendNote,
    setSettingsGoalId,
    showAddGoalForm,
    setShowAddGoalForm,
  } = useUserGoalContext()
  const { getMilestonesForGoal, toggleMilestone } = useUserGoalMilestoneContext()
```

After the `<UserGoalsList .../>` block, add:

```tsx
      <button
        onClick={() => setShowAddGoalForm(!showAddGoalForm)}
        className="px-3 py-1 text-sm rounded bg-indigo-600 text-white"
      >
        {showAddGoalForm ? 'Cancel' : 'Add goal'}
      </button>
      {showAddGoalForm && (
        <UserGoalForm
          onSubmit={async values => {
            await addGoal(values)
            setShowAddGoalForm(false)
          }}
          onCancel={() => setShowAddGoalForm(false)}
        />
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/goal/UserGoalsPage.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/user/goal/UserGoalsPage.tsx \
  packages/react-oyl/modules/user/goal/UserGoalsPage.test.tsx
git commit -m "feat(react): UserGoalsPage add-goal flow"
```

---

### Task 8: UserGoalsPage — settings sheet (edit / delete)

**Files:**
- Modify: `packages/react-oyl/modules/user/goal/UserGoalsPage.tsx`
- Modify: `packages/react-oyl/modules/user/goal/UserGoalsPage.test.tsx`

- [ ] **Step 1: Add failing tests for the settings sheet**

Append inside the `describe`:

```tsx
  it('renders UserGoalSettingsSheet when settingsGoalId matches a goal', () => {
    goalCtx.settingsGoalId = 1
    render(<UserGoalsPage />)
    expect(screen.getByRole('heading', { name: /goal settings/i })).toBeInTheDocument()
    goalCtx.settingsGoalId = null
  })

  it('sheet Save calls updateGoal with the goal id and patch, then clears settingsGoalId', async () => {
    goalCtx.settingsGoalId = 1
    goalCtx.updateGoal.mockClear()
    goalCtx.setSettingsGoalId.mockClear()
    render(<UserGoalsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(goalCtx.updateGoal).toHaveBeenCalled())
    expect(goalCtx.updateGoal.mock.calls[0][0]).toBe(1)
    expect(goalCtx.setSettingsGoalId).toHaveBeenCalledWith(null)
    goalCtx.settingsGoalId = null
  })

  it('sheet Delete calls removeGoal and clears settingsGoalId', async () => {
    goalCtx.settingsGoalId = 1
    goalCtx.removeGoal.mockClear()
    goalCtx.setSettingsGoalId.mockClear()
    render(<UserGoalsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await waitFor(() => expect(goalCtx.removeGoal).toHaveBeenCalledWith(1))
    expect(goalCtx.setSettingsGoalId).toHaveBeenCalledWith(null)
    goalCtx.settingsGoalId = null
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/goal/UserGoalsPage.test.tsx`
Expected: FAIL — sheet not rendered.

- [ ] **Step 3: Wire the sheet into the page body**

Edit `UserGoalsPage.tsx`. Add `UserGoalSettingsSheet` to the goal imports:

```tsx
import {
  UserGoalForm,
  UserGoalProvider,
  UserGoalRow,
  UserGoalSettingsSheet,
  UserGoalsList,
  useUserGoalContext,
} from '@/modules/user/goal'
```

Replace the body's destructure with:

```tsx
  const {
    goals,
    addGoal,
    updateGoal,
    removeGoal,
    setProgress,
    markComplete,
    appendNote,
    settingsGoalId,
    setSettingsGoalId,
    showAddGoalForm,
    setShowAddGoalForm,
  } = useUserGoalContext()
  const { getMilestonesForGoal, toggleMilestone } = useUserGoalMilestoneContext()
  const editingGoal = goals.find(g => g.id === settingsGoalId) ?? null
```

After the `{showAddGoalForm && ...}` block, add:

```tsx
      {editingGoal && editingGoal.id != null && (
        <UserGoalSettingsSheet
          goal={editingGoal}
          goals={goals}
          onSave={patch => updateGoal(editingGoal.id!, patch)}
          onDelete={() => removeGoal(editingGoal.id!)}
          onClose={() => setSettingsGoalId(null)}
        />
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @oyl/react-oyl test --run modules/user/goal/UserGoalsPage.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/user/goal/UserGoalsPage.tsx \
  packages/react-oyl/modules/user/goal/UserGoalsPage.test.tsx
git commit -m "feat(react): UserGoalsPage settings sheet for edit and delete"
```

---

### Task 9: Mount UserGoalsPage at /my/goals and verify whole suite

**Files:**
- Modify: `packages/react-oyl/src/main.tsx`

- [ ] **Step 1: Add the route**

Edit `packages/react-oyl/src/main.tsx`. Add an import after the activity import:

```tsx
import { UserGoalsPage } from '@/modules/user/goal'
```

Add the route inside `<Routes>` immediately above the `my/:settings` route (after the `my/activities` route added in Task 5):

```tsx
          <Route path="my/goals" element={<ProtectedRoute><UserGoalsPage /></ProtectedRoute>} />
```

- [ ] **Step 2: Run the full typecheck and test suite**

Run: `pnpm --filter @oyl/react-oyl exec tsc -b --noEmit`
Expected: exit 0, no output.

Run: `pnpm --filter @oyl/react-oyl test --run`
Expected: all tests PASS. Test file count should be the previous count + 3 (`PageShell`, `UserActivitiesPage`, `UserGoalsPage`).

- [ ] **Step 3: Commit**

```bash
git add packages/react-oyl/src/main.tsx
git commit -m "feat(react): route /my/goals to UserGoalsPage"
```

---

## Out of scope (deferred to follow-up specs)

- `/my/nutrition` catalog — needs new `UserNutritionItemsList`, `UserNutritionItemRow`, `UserNutritionItemForm` primitives.
- Navigation UI to reach `/my/*` routes from `/daily` or the home page.
- Folding `UserDailyPage` onto `PageShell`.
- Date filtering / history view on the catalog.
- A standalone delete confirmation UI outside the SettingsSheet.

## Notes on the partial-mock pattern used in tests

Each page test mocks the page's own provider as a passthrough (`({ children }) => <>{children}</>`) and overrides the context hook to return canned data. This lets the test render the page directly (`<UserActivitiesPage />`) without standing up real Strapi data or wrapping with `UserDailyDataProviders`. The pattern matches the one documented in the `oyl-react-oyl-inversion-pattern` memory.

Because the canned context objects are module-scoped, tests that mutate fields like `settingsActivityId` or `showAddActivityForm` must reset them at the end of the test (e.g. `goalCtx.settingsGoalId = null`) to avoid leaking state into the next test in the file.
