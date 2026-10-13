import { describe, expect, it, beforeAll, vi } from 'vitest'
import { Activity } from '@oyl/all-of-oyl'
import { defineActivityPicker } from './oyl-activity-picker.js'

beforeAll(() => defineActivityPicker())
const settle = () => new Promise((r) => setTimeout(r, 0))
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))
/** @param {any} el @param {string} sel */
const qq = (el, sel) => /** @type {any} */ ([...el.shadowRoot.querySelectorAll(sel)])

/**
 * Fake CatalogClient backed by an in-memory array.
 * @param {Activity[]} initial
 * @returns {import('@oyl/all-of-oyl').CatalogClient<Activity>}
 */
function fakeCatalog(initial = []) {
  /** @type {Activity[]} */
  const items = [...initial]
  return {
    search: async (/** @type {string} */ q) => {
      const lower = q.toLowerCase()
      return items.filter((a) => a.name.toLowerCase().includes(lower))
    },
    list: async () => [...items],
    get: async (/** @type {import('@oyl/all-of-oyl').Id} */ id) => items.find((a) => a.id === id),
    create: (/** @type {Activity} */ item) => { items.push(item) },
  }
}

/**
 * Mount a picker with the given catalog and optional onSelect spy.
 * @param {import('@oyl/all-of-oyl').CatalogClient<Activity>} catalog
 * @param {(a: Activity) => void} [onSelect]
 */
function picker(catalog, onSelect = vi.fn()) {
  const el = /** @type {any} */ (document.createElement('oyl-activity-picker'))
  el.catalog = catalog
  el.onSelect = onSelect
  document.body.append(el)
  return el
}

describe('<oyl-activity-picker>', () => {
  it('renders a search input and an empty result list on mount', async () => {
    const catalog = fakeCatalog([])
    const el = picker(catalog)
    await settle()
    expect(q(el, 'input[name="search"]')).not.toBeNull()
    expect(qq(el, '[data-role="result"]')).toHaveLength(0)
    el.remove()
  })

  it('filters the activity list as the user types in the search input', async () => {
    const run = new Activity({ name: 'Run', slug: 'run' })
    const swim = new Activity({ name: 'Swim', slug: 'swim' })
    const catalog = fakeCatalog([run, swim])
    const el = picker(catalog)
    await settle()

    const searchInput = q(el, 'input[name="search"]')
    searchInput.value = 'ru'
    searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()

    const results = qq(el, '[data-role="result"]')
    expect(results).toHaveLength(1)
    expect(results[0].textContent).toContain('Run')
    el.remove()
  })

  it('calls onSelect with the chosen Activity when a result is clicked', async () => {
    const run = new Activity({ name: 'Run', slug: 'run' })
    const catalog = fakeCatalog([run])
    const onSelect = vi.fn()
    const el = picker(catalog, onSelect)
    await settle()

    const searchInput = q(el, 'input[name="search"]')
    searchInput.value = 'run'
    searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()

    const result = q(el, '[data-role="result"]')
    expect(result).not.toBeNull()
    result.click()
    await settle()

    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith(run)
    el.remove()
  })

  it('"Add new" calls catalog.create and makes the new activity selectable', async () => {
    const catalog = fakeCatalog([])
    const onSelect = vi.fn()
    const el = picker(catalog, onSelect)
    await settle()

    const nameInput = q(el, 'input[name="new-name"]')
    const addBtn = q(el, 'button[data-role="add"]')
    expect(nameInput).not.toBeNull()
    expect(addBtn).not.toBeNull()

    nameInput.value = 'Meditate'
    addBtn.click()
    await settle()

    // The new activity should appear in the search results.
    const searchInput = q(el, 'input[name="search"]')
    searchInput.value = 'Meditate'
    searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()

    const results = qq(el, '[data-role="result"]')
    expect(results).toHaveLength(1)
    expect(results[0].textContent).toContain('Meditate')
    el.remove()
  })

  it('"Add new" calls catalog.create with an Activity containing the given name', async () => {
    const catalog = fakeCatalog([])
    const createSpy = vi.spyOn(catalog, 'create')
    const el = picker(catalog)
    await settle()

    q(el, 'input[name="new-name"]').value = 'Yoga'
    q(el, 'button[data-role="add"]').click()
    await settle()

    expect(createSpy).toHaveBeenCalledOnce()
    const firstCall = createSpy.mock.calls[0]
    expect(firstCall).toBeDefined()
    const created = /** @type {Activity} */ (/** @type {NonNullable<typeof firstCall>} */ (firstCall)[0])
    expect(created).toBeInstanceOf(Activity)
    expect(created.name).toBe('Yoga')
    el.remove()
  })

  it('shows an error and does not call create when the new-name input is empty', async () => {
    const catalog = fakeCatalog([])
    const createSpy = vi.spyOn(catalog, 'create')
    const el = picker(catalog)
    await settle()

    q(el, 'input[name="new-name"]').value = '   '
    q(el, 'button[data-role="add"]').click()
    await settle()

    expect(createSpy).not.toHaveBeenCalled()
    expect(q(el, '[data-role="error"]').textContent).not.toBe('')
    el.remove()
  })

  it('shows an error and does not call create when the name slugs to empty', async () => {
    const catalog = fakeCatalog([])
    const createSpy = vi.spyOn(catalog, 'create')
    const el = picker(catalog)
    await settle()

    q(el, 'input[name="new-name"]').value = '!!!'
    q(el, 'button[data-role="add"]').click()
    await settle()

    expect(createSpy).not.toHaveBeenCalled()
    expect(q(el, '[data-role="error"]').textContent).not.toBe('')
    el.remove()
  })

  it('renders results from the last search when queries arrive out of order', async () => {
    // Simulate a slow first search and a fast second search so the first
    // resolves AFTER the second. The component must show only the second result.
    /** @type {((v: Activity[]) => void)[]} */
    const resolvers = []
    const slow = new Activity({ name: 'Slow', slug: 'slow' })
    const fast = new Activity({ name: 'Fast', slug: 'fast' })

    /** @type {import('@oyl/all-of-oyl').CatalogClient<Activity>} */
    const catalog = {
      search: () => new Promise((resolve) => { resolvers.push(resolve) }),
      list: async () => [],
      get: async () => undefined,
      create: () => {},
    }

    const el = picker(catalog)
    await settle()

    const searchInput = q(el, 'input[name="search"]')

    // First keypress — captures resolver[0]
    searchInput.value = 'sl'
    searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()

    // Second keypress — captures resolver[1]
    searchInput.value = 'fa'
    searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()

    // Resolve SECOND search first (fast)
    const resolveFirst = /** @type {(v: Activity[]) => void} */ (resolvers[0])
    const resolveSecond = /** @type {(v: Activity[]) => void} */ (resolvers[1])
    resolveSecond([fast])
    await settle()

    // Resolve FIRST search after (stale)
    resolveFirst([slow])
    await settle()

    // Only the second (fast) result should be rendered
    const results = qq(el, '[data-role="result"]')
    expect(results).toHaveLength(1)
    expect(results[0].textContent).toContain('Fast')
    el.remove()
  })
})
