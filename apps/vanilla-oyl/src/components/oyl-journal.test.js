import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository, Note } from '@oyl/all-of-oyl'
import { createJournalStore } from '../state/journal-store.js'
import { defineJournal } from './oyl-journal.js'

const TZ = 'America/New_York'
beforeAll(() => defineJournal())

/** @param {ReturnType<typeof createJournalStore>} store @param {string} [tz] */
function screen(store, tz = TZ) {
  const el = /** @type {import('./oyl-journal.js').OylJournal} */ (document.createElement('oyl-journal'))
  el.store = store
  el.tz = tz
  document.body.append(el)
  return el
}
/** @param {import('./oyl-journal.js').OylJournal} el */
const rows = (el) => /** @type {ShadowRoot} */ (el.shadowRoot).querySelectorAll('oyl-entry-row')
/** @param {import('./oyl-journal.js').OylJournal} el */
const txt = (el) => /** @type {ShadowRoot} */ (el.shadowRoot).textContent ?? ''

describe('<oyl-journal>', () => {
  it('renders today’s entries and updates reactively when the store changes', async () => {
    const store = createJournalStore(new InMemoryRepository(), TZ)
    const el = screen(store)
    expect(rows(el)).toHaveLength(0)
    expect(txt(el).toLowerCase()).toContain('nothing')
    await store.add(new Note({ occurredAt: new Date(), text: 'logged now' }))
    await Promise.resolve()
    expect(rows(el)).toHaveLength(1)
    el.remove()
  })

  it('navigating to the previous day shows a different (empty) set', async () => {
    const store = createJournalStore(new InMemoryRepository(), TZ)
    await store.add(new Note({ occurredAt: new Date(), text: 'today' }))
    const el = screen(store)
    await Promise.resolve()
    expect(rows(el)).toHaveLength(1)
    const prev = /** @type {HTMLButtonElement} */ (/** @type {ShadowRoot} */ (el.shadowRoot).querySelector('button[data-nav="prev"]'))
    prev.click()
    await Promise.resolve()
    expect(rows(el)).toHaveLength(0)
    el.remove()
  })

  it('deleting an entry removes its row', async () => {
    const store = createJournalStore(new InMemoryRepository(), TZ)
    await store.add(new Note({ occurredAt: new Date(), text: 'bye' }))
    const el = screen(store)
    await Promise.resolve()
    const row = /** @type {any} */ (/** @type {ShadowRoot} */ (el.shadowRoot).querySelector('oyl-entry-row'))
    const delBtn = /** @type {HTMLButtonElement} */ (row.shadowRoot.querySelector('button[data-act="delete"]'))
    delBtn.click()
    const confirmBtn = /** @type {HTMLButtonElement} */ (row.shadowRoot.querySelector('button[data-act="confirm"]'))
    confirmBtn.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(rows(el)).toHaveLength(0)
    el.remove()
  })
})
