import { Activity } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

/** @typedef {import('@oyl/all-of-oyl').CatalogClient<import('@oyl/all-of-oyl').Activity>} ActivityCatalog */

const styles = sheet(`
  :host { display: block; }
  .search-row { display: flex; gap: .4rem; align-items: center; }
  .results { list-style: none; margin: .3rem 0 0; padding: 0; display: flex; flex-direction: column; gap: .2rem; }
  .results[hidden] { display: none; }
  .result-btn { width: 100%; text-align: left; background: var(--color-bg); color: var(--color-text); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .4rem .6rem; font: inherit; cursor: pointer; }
  .result-btn:hover { background: var(--color-accent); color: white; }
  .add-row { display: flex; gap: .4rem; margin-top: .6rem; align-items: center; }
  input { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .4rem .6rem; flex: 1; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .4rem .8rem; font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; margin-top: .3rem; }
`)

/**
 * Convert a display name to a slug: lowercase, replace spaces/punctuation runs with `_`,
 * strip anything outside [a-z0-9_], collapse repeated underscores, trim leading/trailing.
 * Must satisfy `assertSlug` ([a-z0-9_]+).
 * @param {string} name
 * @returns {string}
 */
function nameToSlug(name) {
  return name
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export class OylActivityPicker extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {ActivityCatalog} */
    this.catalog = /** @type {ActivityCatalog} */ (/** @type {unknown} */ (undefined))
    /** @type {(activity: import('@oyl/all-of-oyl').Activity) => void} */
    this.onSelect = () => {}
    /** @type {import('@oyl/all-of-oyl').Activity[]} */
    this._results = []
    /** @type {string} */
    this._error = ''
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)

    // --- Search row ---
    const searchInput = document.createElement('input')
    searchInput.name = 'search'
    searchInput.placeholder = 'Search activities…'
    searchInput.setAttribute('aria-label', 'Search activities')
    const searchRow = document.createElement('div')
    searchRow.className = 'search-row'
    searchRow.append(searchInput)

    // --- Results list ---
    const resultsList = document.createElement('ul')
    resultsList.className = 'results'
    resultsList.hidden = true

    /** Rebuild the results list from this._results. */
    const renderResults = () => {
      resultsList.replaceChildren()
      if (this._results.length === 0) {
        resultsList.hidden = true
        return
      }
      resultsList.hidden = false
      for (const activity of this._results) {
        const li = document.createElement('li')
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'result-btn'
        btn.dataset.role = 'result'
        btn.textContent = activity.name
        btn.addEventListener('click', () => {
          this.onSelect(activity)
          // Clear search after selection
          searchInput.value = ''
          this._results = []
          renderResults()
        }, { signal: this.lifecycle })
        li.append(btn)
        resultsList.append(li)
      }
    }

    searchInput.addEventListener('input', async () => {
      const q = searchInput.value.trim()
      if (q === '') {
        this._results = []
        renderResults()
        return
      }
      this._results = await this.catalog.search(q)
      renderResults()
    }, { signal: this.lifecycle })

    // --- Add new row ---
    const newNameInput = document.createElement('input')
    newNameInput.name = 'new-name'
    newNameInput.placeholder = 'New activity name…'
    newNameInput.setAttribute('aria-label', 'New activity name')

    const addBtn = document.createElement('button')
    addBtn.type = 'button'
    addBtn.className = 'primary'
    addBtn.dataset.role = 'add'
    addBtn.textContent = 'Add new'

    const addRow = document.createElement('div')
    addRow.className = 'add-row'
    addRow.append(newNameInput, addBtn)

    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')

    addBtn.addEventListener('click', () => {
      error.textContent = ''
      const name = newNameInput.value.trim()
      if (name === '') {
        error.textContent = 'Activity name is required'
        return
      }
      const slug = nameToSlug(name)
      if (slug === '') {
        error.textContent = 'Could not derive a valid slug from that name'
        return
      }
      const activity = new Activity({ name, slug })
      this.catalog.create(activity)
      newNameInput.value = ''
      // Surface the new activity immediately in search results.
      this._results = [activity]
      renderResults()
    }, { signal: this.lifecycle })

    root.append(searchRow, resultsList, addRow, error)
  }
}

/** Register the element (idempotent). */
export function defineActivityPicker() {
  if (!customElements.get('oyl-activity-picker')) customElements.define('oyl-activity-picker', OylActivityPicker)
}
