import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { DayKey, Goal, type GoalProgress } from '@oyl/all-of-oyl'
import { core } from '../../../vitest-setup.js'

type Row = HTMLElement & { itemId: string; name: string; met?: boolean; ratio: number; tone?: string; label: string; action?: { act: string; label: string } }

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const rows = (root: HTMLElement) => [...root.shadowRoot!.querySelectorAll('ol.goals oyl-progress-row')] as Row[]
const flush = () => new Promise((r) => setTimeout(r, 0))
const today = () => DayKey.from(new Date(), 'UTC')
const act = (row: Row, a: string) => row.dispatchEvent(new CustomEvent('act', { detail: { act: a, itemId: row.itemId }, bubbles: true }))

const sleep = (name?: string) => new Goal({ metric: 'sleep.hours', target: 8, direction: 'atLeast', period: 'day', aggregation: 'sum', ...(name ? { name } : {}) })
const run = () => new Goal({ metric: 'activity.run.minutes', target: 60, direction: 'atLeast', period: 'week', aggregation: 'sum' })

async function stores(goals: Goal[] = [], progressOf: (g: Goal) => Partial<GoalProgress> = () => ({})) {
  const { signal } = await core()
  const gRev = signal(0), jRev = signal(0)
  const list = [...goals]
  const bump = (s: { get(): number; set(v: number): void }) => s.set(s.get() + 1)
  const goalsStore = {
    all: () => { gRev.get(); return [...list] },
    add: vi.fn(async (g: Goal) => { list.push(g); bump(gRev); return g }),
    remove: vi.fn(async (id: string) => { const i = list.findIndex((g) => g.id === id); if (i >= 0) list.splice(i, 1); bump(gRev) }),
    pause: vi.fn(async (id: string, on: DayKey) => { list.find((g) => g.id === id)?.pause(on); bump(gRev) }),
    resume: vi.fn(async (id: string, on: DayKey) => { list.find((g) => g.id === id)?.resume(on); bump(gRev) }),
  }
  const journal = {
    progressOf: vi.fn((g: Goal): GoalProgress => {
      jRev.get()
      const paused = g.pauses.some((r) => r.from.compare(today()) <= 0 && (r.to === undefined || r.to.compare(today()) >= 0))
      const base = { current: 0, target: g.target, ratio: 0, paused, empty: false, ...progressOf(g) }
      return paused ? { ...base, met: undefined } : base
    }),
    bumpJournal: () => bump(jRev),
  }
  return { goalsStore, journal }
}

const mount = async (s: Awaited<ReturnType<typeof stores>>) => render(<oyl-goals store={s.goalsStore} journal={s.journal} tz="UTC" />)

describe('oyl-goals', () => {
  it('shows the heading, the collapsed form and the empty state without a summary', async () => {
    const s = await stores()
    const { root } = await mount(s)
    expect(q(root, 'h2')).toHaveTextContent('Goals')
    expect(q(root, 'h2')).toHaveAttribute('tabindex', '-1')
    expect(q(root, '[data-role="summary"]')).toBeNull()
    expect(q(root, 'details summary')).toHaveTextContent('New goal')
    expect((q(root, 'details oyl-goal-form') as any).store).toBe(s.goalsStore)
    expect(q(root, '.empty')).toHaveTextContent('No goals yet.')
    expect(q(root, 'ol.goals')).toBeNull()
  })

  it('renders a row per goal from its progress and the summary line', async () => {
    const met = sleep('Sleep more'), active = run(), paused = sleep()
    paused.pause(today().addDays(-2))
    const s = await stores([met, active, paused], (g) => (g === met ? { current: 8, ratio: 1, met: true } : g === active ? { current: 15, ratio: 0.25, met: false } : {}))
    const { root } = await mount(s)
    expect(q(root, '[data-role="summary"]')).toHaveTextContent('1 of 3 met today · 1 paused')
    expect(q(root, '.empty')).toBeNull()
    const [r1, r2, r3] = rows(root)
    expect([r1.itemId, r1.name, r1.met, r1.ratio, r1.tone, r1.label, r1.action]).toEqual([met.id, 'Sleep more', true, 1, 'met', '8 / 8 h', { act: 'pause', label: 'Pause' }])
    expect([r2.name, r2.met, r2.ratio, r2.tone, r2.label, r2.action]).toEqual(['activity.run.minutes', false, 0.25, undefined, '15 / 60 min', { act: 'pause', label: 'Pause' }])
    expect([r3.name, r3.tone, r3.label, r3.action]).toEqual(['sleep.hours', 'muted', 'Paused', { act: 'resume', label: 'Resume' }])
  })

  it('an empty period is muted; a pause that closed today still offers Pause', async () => {
    const empty = run(), closed = sleep()
    closed.pause(today())
    closed.resume(today())
    const s = await stores([empty, closed], (g) => (g === empty ? { empty: true } : {}))
    const { root } = await mount(s)
    const [r1, r2] = rows(root)
    expect([r1.tone, r1.label]).toEqual(['muted', 'No data this period'])
    expect([r2.tone, r2.label, r2.action]).toEqual(['muted', 'Paused', { act: 'pause', label: 'Pause' }])
  })

  it('pause/resume go to the store with today, announce, and flip the action', async () => {
    const g = sleep('Sleep more')
    const s = await stores([g], () => ({ current: 4, ratio: 0.5, met: false }))
    const { root, waitForChanges } = await mount(s)
    const live = () => q(root, '[aria-live]')!
    act(rows(root)[0], 'pause')
    await flush(); await waitForChanges()
    expect(s.goalsStore.pause).toHaveBeenCalledWith(g.id, today())
    expect(live()).toHaveTextContent('Paused')
    expect(rows(root)[0].action).toEqual({ act: 'resume', label: 'Resume' })
    expect(rows(root)[0].label).toBe('Paused')
    expect(q(root, '[data-role="summary"]')).toHaveTextContent('0 of 1 met today · 1 paused')
    act(rows(root)[0], 'resume')
    await flush(); await waitForChanges()
    expect(s.goalsStore.resume).toHaveBeenCalledWith(g.id, today())
    expect(live()).toHaveTextContent('Resumed')
    expect(rows(root)[0].action).toEqual({ act: 'pause', label: 'Pause' })
  })

  it('a rejected pause lands in the live region instead of escaping', async () => {
    const g = sleep()
    const s = await stores([g])
    s.goalsStore.pause.mockImplementationOnce(async () => { throw new Error('offline') })
    const { root, waitForChanges } = await mount(s)
    act(rows(root)[0], 'pause')
    await flush(); await waitForChanges()
    expect(q(root, '[aria-live]')).toHaveTextContent('offline')
  })

  it('remove goes to the store and the row disappears; added announces; journal changes refresh labels', async () => {
    const g = sleep()
    let current = 2
    const s = await stores([g], () => ({ current, ratio: current / 8, met: false }))
    const { root, waitForChanges } = await mount(s)
    expect(rows(root)[0].label).toBe('2 / 8 h')
    current = 6
    s.journal.bumpJournal()
    await waitForChanges()
    expect(rows(root)[0].label).toBe('6 / 8 h')
    q(root, 'oyl-goal-form')!.dispatchEvent(new CustomEvent('added', { bubbles: true }))
    await waitForChanges()
    expect(q(root, '[aria-live]')).toHaveTextContent('Goal added')
    rows(root)[0].dispatchEvent(new CustomEvent('remove', { detail: g.id, bubbles: true }))
    await flush(); await waitForChanges()
    expect(s.goalsStore.remove).toHaveBeenCalledWith(g.id)
    expect(q(root, '[aria-live]')).toHaveTextContent('Deleted')
    expect(rows(root)).toHaveLength(0)
    expect(q(root, '.empty')).toHaveTextContent('No goals yet.')
  })
})
