import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
})
