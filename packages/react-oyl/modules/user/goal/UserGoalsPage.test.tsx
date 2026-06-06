import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { TDataId, TUserGoalData, TUserGoalMilestoneData } from '@oyl/all-of-oyl/modules'
import UserGoalsPage from './UserGoalsPage'

const goals: TUserGoalData[] = [
  { id: 1, documentId: 'g1', name: 'Run 5k', priority: 'medium', current_status: 'active', progress: 2, target: 5 } as never,
  { id: 2, documentId: 'g2', name: 'Read 12 books', priority: 'low', current_status: 'active', progress: 4, target: 12 } as never,
]

const goalCtx = {
  goals,
  getGoal: (id: TDataId) => goals.find(g => g.id === id),
  addGoal: vi.fn(async (_input: Partial<TUserGoalData>) => {}),
  updateGoal: vi.fn(async (_id: TDataId, _patch: Partial<TUserGoalData>) => {}),
  removeGoal: vi.fn(async (_id: TDataId) => {}),
  setProgress: vi.fn(async (_id: TDataId, _value: number) => {}),
  markComplete: vi.fn(async (_id: TDataId) => {}),
  appendNote: vi.fn(async (_id: TDataId, _text: string) => {}),
  showAddGoalForm: false,
  setShowAddGoalForm: vi.fn(),
  settingsGoalId: null as TDataId | null,
  setSettingsGoalId: vi.fn(),
}

const milestones: TUserGoalMilestoneData[] = []
const milestoneCtx = {
  milestones,
  getMilestonesForGoal: (_goalId: TDataId) => [] as TUserGoalMilestoneData[],
  addMilestone: vi.fn(async (_input: Partial<TUserGoalMilestoneData>) => {}),
  toggleMilestone: vi.fn(async (_id: TDataId) => {}),
  removeMilestone: vi.fn(async (_id: TDataId) => {}),
  reorderMilestones: vi.fn(async (_goalId: TDataId, _ids: TDataId[]) => {}),
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
