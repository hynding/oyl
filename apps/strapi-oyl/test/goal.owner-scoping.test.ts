import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boot } from './boot'
import { registerUser } from './helpers'
import { strapiRowToShape, Goal } from '@oyl/all-of-oyl'

let baseUrl: string
let stop: () => Promise<void>
let jwtA: string
let jwtB: string

beforeAll(async () => {
  ;({ baseUrl, stop } = await boot())
  ;({ jwt: jwtA } = await registerUser(baseUrl, `goalA-${Date.now()}`))
  ;({ jwt: jwtB } = await registerUser(baseUrl, `goalB-${Date.now()}`))
})
afterAll(async () => { await stop?.() })

const h = (jwt?: string) => ({ 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) })

// Writes go via PUT /goals/<recordId> — the backend upserts by the domain recordId.
const putGoal = (jwt: string, recordId: string, data: Record<string, unknown>) =>
  fetch(`${baseUrl}/goals/${recordId}`, {
    method: 'PUT',
    headers: h(jwt),
    body: JSON.stringify({ data }),
  })

const listGoals = async (jwt: string) => {
  const res = await fetch(`${baseUrl}/goals`, { headers: h(jwt) })
  const body = (await res.json()) as { data: unknown[] }
  return body.data
}

const BASE_GOAL = {
  name: 'Run weekly',
  metric: 'activity.run.minutes',
  target: 100,
  direction: 'atLeast',
  period: 'week',
  aggregation: 'sum',
  emptyPeriods: 'skip',
} as const

describe('goal content-type — owner scoping (booted)', () => {
  it('unauthenticated request is rejected (401/403)', async () => {
    const res = await fetch(`${baseUrl}/goals`, { headers: h() })
    expect([401, 403]).toContain(res.status)
  })

  it('PUT to a new recordId creates the goal; A sees it, B does not', async () => {
    const recordId = crypto.randomUUID()
    const res = await putGoal(jwtA, recordId, BASE_GOAL)
    expect(res.status).toBe(200)
    const created = (await res.json()) as { data: { recordId: string } }
    expect(created.data.recordId).toBe(recordId)

    const aList = await listGoals(jwtA)
    const bList = await listGoals(jwtB)

    expect(aList.some((r: any) => r.recordId === recordId)).toBe(true)
    expect(bList.some((r: any) => r.recordId === recordId)).toBe(false)
  })

  it('a second PUT by A upserts (idempotent — one row, latest wins)', async () => {
    const recordId = crypto.randomUUID()
    const first = await putGoal(jwtA, recordId, { ...BASE_GOAL, target: 80 })
    expect(first.status).toBe(200)
    const second = await putGoal(jwtA, recordId, { ...BASE_GOAL, target: 100 })
    expect(second.status).toBe(200)

    const aList = await listGoals(jwtA)
    const matches = aList.filter((r: any) => r.recordId === recordId)
    expect(matches).toHaveLength(1) // upsert reconciled to a single row
    expect((matches[0] as any).target).toBeCloseTo(100) // latest write wins
  })

  it("B's PUT to A's recordId is refused (404) and leaves A's row untouched", async () => {
    const recordId = crypto.randomUUID()
    const res = await putGoal(jwtA, recordId, { ...BASE_GOAL, target: 75 })
    expect(res.status).toBe(200)

    // recordId is globally unique and owned by A; B's PUT must not reach across owners
    const bPut = await putGoal(jwtB, recordId, { ...BASE_GOAL, target: 999 })
    expect(bPut.status).toBe(404)

    const aGet = await fetch(`${baseUrl}/goals/${recordId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
    const aRow = (await aGet.json()) as { data: { target: number } }
    expect(aRow.data.target).toBeCloseTo(75) // untouched by B
  })

  it("B's DELETE on A's recordId is refused (404)", async () => {
    const recordId = crypto.randomUUID()
    const res = await putGoal(jwtA, recordId, BASE_GOAL)
    expect(res.status).toBe(200)

    const bDel = await fetch(`${baseUrl}/goals/${recordId}`, { method: 'DELETE', headers: h(jwtB) })
    expect(bDel.status).toBe(404)

    // Row should still exist for A
    const aGet = await fetch(`${baseUrl}/goals/${recordId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
  })

  it('Goal fields round-trip via Goal.fromJSON (strapiRowToShape)', async () => {
    const recordId = crypto.randomUUID()
    const res = await putGoal(jwtA, recordId, BASE_GOAL)
    expect(res.status).toBe(200)

    // Fetch it back
    const getRes = await fetch(`${baseUrl}/goals/${recordId}`, { headers: h(jwtA) })
    expect(getRes.status).toBe(200)
    const body = (await getRes.json()) as { data: Record<string, unknown> }
    const row = body.data

    // Decode via Goal.fromJSON — exactly how the app would read goals
    const shape = strapiRowToShape(row)
    const goal = Goal.fromJSON(shape)

    expect(goal.metric.toString()).toBe('activity.run.minutes')
    expect(goal.target).toBe(100)
    expect(goal.direction).toBe('atLeast')
    expect(goal.period).toBe('week')
    expect(goal.aggregation).toBe('sum')
    expect(goal.emptyPeriods).toBe('skip')
  })

  describe('pauses round-trips', () => {
    it('(a) closed pause [{from, to}] round-trips correctly', async () => {
      const recordId = crypto.randomUUID()
      const res = await putGoal(jwtA, recordId, {
        ...BASE_GOAL,
        pauses: [{ from: '2026-03-01', to: '2026-03-05' }],
      })
      expect(res.status).toBe(200)

      const getRes = await fetch(`${baseUrl}/goals/${recordId}`, { headers: h(jwtA) })
      const body = (await getRes.json()) as { data: Record<string, unknown> }
      const shape = strapiRowToShape(body.data)
      const goal = Goal.fromJSON(shape)

      expect(goal.pauses).toHaveLength(1)
      expect(goal.pauses[0]!.from.value).toBe('2026-03-01')
      expect(goal.pauses[0]!.to?.value).toBe('2026-03-05')
    })

    it('(b) open pause [{from}] (no to) round-trips with to undefined — no crash', async () => {
      const recordId = crypto.randomUUID()
      const res = await putGoal(jwtA, recordId, {
        ...BASE_GOAL,
        pauses: [{ from: '2026-03-01' }],
      })
      expect(res.status).toBe(200)

      const getRes = await fetch(`${baseUrl}/goals/${recordId}`, { headers: h(jwtA) })
      const body = (await getRes.json()) as { data: Record<string, unknown> }
      const shape = strapiRowToShape(body.data)
      const goal = Goal.fromJSON(shape)

      expect(goal.pauses).toHaveLength(1)
      expect(goal.pauses[0]!.from.value).toBe('2026-03-01')
      expect(goal.pauses[0]!.to).toBeUndefined()
    })

    it('(c) no pauses field round-trips with goal.pauses empty', async () => {
      const recordId = crypto.randomUUID()
      const res = await putGoal(jwtA, recordId, BASE_GOAL) // no pauses key
      expect(res.status).toBe(200)

      const getRes = await fetch(`${baseUrl}/goals/${recordId}`, { headers: h(jwtA) })
      const body = (await getRes.json()) as { data: Record<string, unknown> }
      const shape = strapiRowToShape(body.data)
      const goal = Goal.fromJSON(shape)

      expect(goal.pauses).toHaveLength(0)
    })
  })
})
