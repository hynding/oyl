import { describe, expect, it } from 'vitest'
import { digestOf } from './digest.js'

const goal = (met: boolean | undefined) => ({
  goalId: 'g',
  progress: { current: 0, target: 1, ratio: 0, ...(met === undefined ? {} : { met }), paused: false, empty: false },
  streak: 99, // per-goal period streak — must NOT leak into Digest.streak
})

describe('digestOf', () => {
  it('counts done/total plans and met/total goals, passes the day streak through', () => {
    const review = { goals: [goal(true), goal(false), goal(undefined)] }
    const todayPlan = [{ status: 'done' }, { status: 'done' }, { status: 'open' }]
    expect(digestOf(review, todayPlan, 12)).toEqual({
      plansDone: 2,
      plansTotal: 3,
      goalsMet: 1,
      goalsTotal: 3,
      streak: 12,
    })
  })

  it('handles the empty day', () => {
    expect(digestOf({ goals: [] }, [], 0)).toEqual({
      plansDone: 0, plansTotal: 0, goalsMet: 0, goalsTotal: 0, streak: 0,
    })
  })

  it('never reads the per-goal streak', () => {
    const review = { goals: [goal(true)] }
    expect(digestOf(review, [], 3).streak).toBe(3)
  })
})
