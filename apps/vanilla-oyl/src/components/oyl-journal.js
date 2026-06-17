import { DayKey } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'
import { relativeDayLabel, formatDayHeading } from '@oyl/all-of-oyl/format'
import { defineLogForm } from './oyl-log-form.js'
import { defineEntryRow } from './oyl-entry-row.js'

/** @typedef {ReturnType<typeof import('../state/journal-store.js').createJournalStore>} JournalStore */

const styles = sheet(`
  :host { display: block; }
  .daynav { display: flex; align-items: center; justify-content: center; gap: .4rem; margin-block-end: 1.4rem; }
  .daynav button { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; inline-size: 2.1rem; block-size: 2.1rem; border-radius: 999px; font-size: 1.1rem; }
  .daynav button:hover:not(:disabled) { background: color-mix(in oklch, var(--color-text) 6%, transparent); color: var(--color-text); }
  .daynav button:disabled { opacity: .35; cursor: default; }
  .day { text-align: center; min-inline-size: 13rem; }
  h2 { font-size: var(--step-2); font-weight: 640; letter-spacing: -.02em; line-height: 1.1; }
  .rel { color: var(--color-muted); font-size: .85rem; margin-block-start: .15rem; }
  oyl-log-form { display: block; margin-block-end: 1.6rem; }
  ol { list-style: none; margin: 0; padding: 0; }
  .empty { text-align: center; color: var(--color-muted); padding: 2.5rem 1rem; }
  .sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`)

export class OylJournal extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {JournalStore} */
    this.store = /** @type {JournalStore} */ (/** @type {unknown} */ (undefined))
    /** @type {string} */
    this.tz = 'UTC'
    /** @type {import('../lib/reactive/signal.js').Signal<DayKey>} */
    this._day = /** @type {any} */ (undefined)
  }

  render() {
    defineLogForm()
    defineEntryRow()
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    this._day = signal(DayKey.from(now(), this.tz), (a, b) => a.equals(b))

    const daynav = document.createElement('div')
    daynav.className = 'daynav'
    const prev = this._navButton('prev', '‹', 'Previous day')
    const next = this._navButton('next', '›', 'Next day')
    const dayBox = document.createElement('div')
    dayBox.className = 'day'
    const h2 = document.createElement('h2')
    h2.tabIndex = -1
    const rel = document.createElement('div')
    rel.className = 'rel'
    dayBox.append(h2, rel)
    daynav.append(prev, dayBox, next)

    const live = document.createElement('div')
    live.className = 'sr-only'
    live.setAttribute('aria-live', 'polite')

    const formEl = /** @type {import('./oyl-log-form.js').OylLogForm} */ (document.createElement('oyl-log-form'))
    formEl.store = this.store
    formEl.getDay = () => this._day.get()
    formEl.onLogged = () => { live.textContent = 'Entry added' }

    const list = document.createElement('ol')
    const empty = document.createElement('div')
    empty.className = 'empty'

    root.append(daynav, live, formEl, list, empty)

    this.addEventListener('keydown', (e) => {
      const t = /** @type {HTMLElement | null} */ (e.composedPath()[0] ?? null)
      const tag = t ? t.tagName : ''
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft') this._go(-1, h2, live)
      else if (e.key === 'ArrowRight') this._go(1, h2, live)
    }, { signal: this.lifecycle })

    prev.addEventListener('click', () => this._go(-1, h2, live), { signal: this.lifecycle })
    next.addEventListener('click', () => this._go(1, h2, live), { signal: this.lifecycle })

    this.track(() => {
      const day = this._day.get()
      const today = DayKey.from(now(), this.tz)
      h2.textContent = formatDayHeading(day)
      rel.textContent = relativeDayLabel(day, today)
      const entries = [...this.store.entriesOn(day)].filter((e) => e.kind !== 'transaction').sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      list.replaceChildren()
      for (const entry of entries) {
        const row = /** @type {import('./oyl-entry-row.js').OylEntryRow} */ (document.createElement('oyl-entry-row'))
        row.entry = entry
        row.onDelete = (id) => { void this.store.remove(id); live.textContent = 'Entry deleted' }
        const li = document.createElement('li')
        li.append(row)
        list.append(li)
      }
      empty.hidden = entries.length > 0
      empty.textContent = entries.length > 0 ? '' : `Nothing logged for ${formatDayHeading(day)}. Add a note or a measurement above.`
    })
  }

  /** @param {number} delta @param {HTMLElement} h2 @param {HTMLElement} live */
  _go(delta, h2, live) {
    this._day.set(this._day.get().addDays(delta))
    h2.focus()
    live.textContent = `Showing ${formatDayHeading(this._day.get())}`
  }

  /** @param {string} dir @param {string} glyph @param {string} label @returns {HTMLButtonElement} */
  _navButton(dir, glyph, label) {
    const b = document.createElement('button')
    b.dataset.nav = dir
    b.textContent = glyph
    b.setAttribute('aria-label', label)
    return b
  }
}

/** Register the element (idempotent). */
export function defineJournal() {
  if (!customElements.get('oyl-journal')) customElements.define('oyl-journal', OylJournal)
}
