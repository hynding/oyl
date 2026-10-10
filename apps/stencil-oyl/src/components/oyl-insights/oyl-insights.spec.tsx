import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { DayKey, DayRange, Id, periodWindowOf, type Review } from '@oyl/all-of-oyl'
import { core } from '../../../vitest-setup.js'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const qa = (root: HTMLElement, sel: string) => [...root.shadowRoot!.querySelectorAll(sel)]
const flush = () => new Promise((r) => setTimeout(r, 0))
const today = () => DayKey.from(new Date(), 'UTC')
const text = (el: Element | null) => el?.textContent?.trim() ?? ''
const tiles = (root: HTMLElement) => qa(root, '.totals[data-role="totals"] .tile').map((t) => ({ key: t.getAttribute('data-tile'), value: text(t.querySelector('b')), caption: text(t.querySelector('small')), delta: text(t.querySelector('.delta')) }))
const rows = (root: HTMLElement, list: string) => qa(root, `ol.${list} li`).map((li) => [text(li.querySelector('.k')), text(li.querySelector('.v'))])
const pickPeriod = (root: HTMLElement, value: string) => q(root, 'ui-segment')!.dispatchEvent(new CustomEvent('uiChange', { detail: { value }, bubbles: true, composed: true }))

const zero = { spending: 0, activityMinutes: 0, calories: 0 }
const makeReview = (range: DayRange, over: Partial<Review> = {}): Review => ({ period: range, goals: [], topSpending: [], activityTotals: [], totals: zero, previousTotals: zero, deltas: zero, areas: [], ...over })
const progress = (over: Record<string, unknown>) => ({ current: 0, target: 1, ratio: 0, paused: false, empty: false, ...over }) as Review['goals'][number]['progress']

async function fake(over: () => Partial<Review> = () => ({})) {
  const { signal } = await core()
  const rev = signal(0)
  const review = vi.fn((range: DayRange) => { rev.get(); return makeReview(range, over()) })
  return { review, bump: () => rev.set(rev.get() + 1) }
}
const lastRange = (review: ReturnType<typeof vi.fn>) => review.mock.calls.at(-1)![0] as DayRange
const sameRange = (a: DayRange, b: DayRange) => [a.start.value, a.end.value].join('..') === [b.start.value, b.end.value].join('..')

describe('oyl-insights', () => {
  it('renders the heading, the segment, four dashed tiles and the four empty states', async () => {
    const f = await fake()
    const { root } = await render(<oyl-insights review={f.review} tz="UTC" />)
    expect(q(root, 'h2')).toHaveTextContent('Insights')
    expect(q(root, 'h2')).toHaveAttribute('tabindex', '-1')
    const seg = q(root, 'ui-segment[name="period"]') as any
    expect(seg.options.map((o: { value: string }) => o.value)).toEqual(['week', 'month'])
    expect(seg.value).toBe('month')
    expect(tiles(root)).toEqual([
      { key: 'spending', value: '$0.00', caption: 'Spent', delta: '' },
      { key: 'activity', value: '0', caption: 'Active min', delta: '' },
      { key: 'calories', value: '0', caption: 'Calories', delta: '' },
      { key: 'completion', value: '—', caption: 'Plans done', delta: '' },
    ])
    expect(text(q(root, 'section.goals .empty'))).toBe('No goals yet')
    expect(text(q(root, 'section.spending .empty'))).toBe('Nothing this period')
    expect(text(q(root, 'section.activity .empty'))).toBe('Nothing this period')
    expect(text(q(root, 'section.areas .empty'))).toBe('No areas tracked')
    expect(qa(root, 'ol')).toHaveLength(0)
    expect(sameRange(lastRange(f.review), periodWindowOf('month', today()))).toBe(true)
  })

  it('the segment switches the review window', async () => {
    const f = await fake()
    const { root, waitForChanges } = await render(<oyl-insights review={f.review} tz="UTC" />)
    pickPeriod(root, 'week')
    await flush(); await waitForChanges()
    expect(sameRange(lastRange(f.review), periodWindowOf('week', today()))).toBe(true)
    expect((q(root, 'ui-segment') as any).value).toBe('week')
  })

  it('fills the tiles with values and deltas', async () => {
    const f = await fake(() => ({ totals: { spending: 230, activityMinutes: 135.4, calories: 14200 }, deltas: { spending: 42.5, activityMinutes: -20, calories: 0 }, completionRate: 0.754 }))
    const { root } = await render(<oyl-insights review={f.review} tz="UTC" />)
    expect(tiles(root).map((t) => [t.value, t.delta])).toEqual([['$230.00', '↑ $42.50'], ['135', '↓ 20'], ['14200', ''], ['75%', '']])
  })

  it('lists goals, top spending, activity and life areas from the review', async () => {
    const health = Id.create()
    const f = await fake(() => ({
      goals: [
        { goalId: Id.create(), name: 'Sleep more', progress: progress({ met: true, ratio: 1 }), streak: 4 },
        { goalId: Id.create(), progress: progress({ met: false, ratio: 0.6 }), streak: 0 },
      ],
      topSpending: [{ category: 'groceries', total: 200 }, { category: 'dining', total: 30 }],
      activityTotals: [{ slug: 'run', count: 3, minutes: 120 }],
      areas: [
        { areaId: health, name: 'Health', goalsMet: 1, goalsTotal: 2, activityMinutes: 135, projectsTouched: 0 },
        { name: 'Unassigned?', goalsMet: 1, goalsTotal: 1, activityMinutes: 0, projectsTouched: 0 },
        { name: 'nothing', goalsMet: 0, goalsTotal: 0, activityMinutes: 0, projectsTouched: 0 },
        { areaId: Id.create(), name: 'Quiet', goalsMet: 0, goalsTotal: 0, activityMinutes: 0, projectsTouched: 0 },
      ],
    }))
    const { root } = await render(<oyl-insights review={f.review} tz="UTC" />)
    expect(rows(root, 'goals')).toEqual([['Sleep more', 'Met · 🔥 4'], ['Goal', '60%']])
    expect(rows(root, 'spending')).toEqual([['groceries', '$200.00'], ['dining', '$30.00']])
    expect(rows(root, 'activity')).toEqual([['run', '120 min · 3×']])
    expect(rows(root, 'areas')).toEqual([['Health', '1/2 goals · 135 min'], ['Unassigned', '1/1 goals'], ['Quiet', 'Nothing tracked']])
    const fills = qa(root, 'ol.areas li').map((li) => (li.querySelector('.fill') as HTMLElement | null)?.style.getPropertyValue('inline-size'))
    expect(fills).toEqual(['50%', '100%', undefined])
    expect(qa(root, '.empty')).toHaveLength(0)
  })

  it('re-reads the review when a store revision bumps', async () => {
    let spending = 10
    const f = await fake(() => ({ totals: { ...zero, spending } }))
    const { root, waitForChanges } = await render(<oyl-insights review={f.review} tz="UTC" />)
    expect(tiles(root)[0]!.value).toBe('$10.00')
    spending = 25
    f.bump()
    await flush(); await waitForChanges()
    expect(tiles(root)[0]!.value).toBe('$25.00')
  })
})
