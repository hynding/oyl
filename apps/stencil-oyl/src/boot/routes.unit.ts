import { describe, expect, it } from 'vitest'
import { navRoutesCovered } from './routes.js'

describe('routes', () => {
  it('names every nav item (journal, planner, nutrition, finance, vault, status + the placeholders) plus the auth pages', () => {
    const keys = ['status', 'login', 'register', 'journal', 'planner', 'nutrition', 'finance', 'goals', 'vault', 'insights', 'profile']
    const routes = Object.fromEntries(keys.map((k) => [k, () => document.createElement('div')]))
    expect(navRoutesCovered(routes)).toEqual([])
    expect(navRoutesCovered({ status: routes.status })).toEqual(['journal', 'planner', 'nutrition', 'finance', 'goals', 'vault', 'insights'])
  })
})
