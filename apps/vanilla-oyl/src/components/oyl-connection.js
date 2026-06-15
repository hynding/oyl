import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { normalizeBaseUrl } from '../storage/config.js'

/** @typedef {{ mode: 'local'|'remote', apiBaseUrl: string, defaultApiBaseUrl: string, onApply: (mode: 'local'|'remote', url: string) => void }} ConnectionConfig */

const styles = sheet(`
  .seg { display: inline-flex; background: color-mix(in oklch, var(--color-text) 6%, transparent); border-radius: 999px; padding: .2rem; gap: .15rem; margin-block-end: .4rem; }
  .seg button { font: inherit; border: 0; background: none; cursor: pointer; padding: .3rem .9rem; border-radius: 999px; font-size: .85rem; font-weight: 550; color: var(--color-muted); }
  .seg button[aria-pressed="true"] { background: var(--color-surface); color: var(--color-text); }
  .hint { color: var(--color-muted); font-size: .8rem; margin-block: .1rem .6rem; }
  form { display: grid; gap: .5rem; max-inline-size: 28rem; }
  label { display: grid; gap: .25rem; font-size: .85rem; color: var(--color-muted); }
  input { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .5rem .6rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1rem; font: inherit; font-weight: 600; cursor: pointer; justify-self: start; }
  button.primary:disabled { opacity: .6; cursor: default; }
  .was { color: var(--color-muted); font-size: .8rem; margin-block-start: .1rem; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; }
`)

export class OylConnection extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {ConnectionConfig | null} */
    this.connection = null
  }

  render() {
    if (!this.connection) return
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const conn = this.connection
    const savedMode = conn.mode
    const savedUrl = normalizeBaseUrl(conn.apiBaseUrl)
    let stagedMode = savedMode

    const seg = document.createElement('div')
    seg.className = 'seg'
    seg.setAttribute('role', 'group')
    seg.setAttribute('aria-label', 'Storage mode')
    const localBtn = segButton('local', 'Local')
    const remoteBtn = segButton('remote', 'Remote')
    seg.append(localBtn, remoteBtn)

    const modeHint = document.createElement('p')
    modeHint.className = 'hint'
    modeHint.textContent = 'Remote mode requires sign-in (Account, below).'

    const form = document.createElement('form')
    const label = document.createElement('label')
    label.textContent = 'Backend URL'
    const urlInput = document.createElement('input')
    urlInput.type = 'url'
    urlInput.autocomplete = 'off'
    urlInput.placeholder = conn.defaultApiBaseUrl
    urlInput.value = conn.apiBaseUrl
    label.append(urlInput)

    const urlHint = document.createElement('span')
    urlHint.className = 'hint'
    urlHint.id = 'conn-url-hint'
    urlHint.textContent = 'Used in Remote mode.'

    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.id = 'conn-error'
    error.setAttribute('aria-live', 'polite')
    urlInput.setAttribute('aria-describedby', 'conn-url-hint conn-error')

    const submit = document.createElement('button')
    submit.type = 'button'
    submit.className = 'primary'
    submit.textContent = 'Apply & reload'

    const was = document.createElement('p')
    was.className = 'was'
    was.textContent = `was: ${savedMode === 'remote' ? 'Remote' : 'Local'} · ${savedUrl || conn.defaultApiBaseUrl}`

    form.append(label, urlHint, error, submit, was)
    root.append(seg, modeHint, form)

    const changed = () => stagedMode !== savedMode || normalizeBaseUrl(urlInput.value) !== savedUrl
    const recompute = () => {
      localBtn.setAttribute('aria-pressed', String(stagedMode === 'local'))
      remoteBtn.setAttribute('aria-pressed', String(stagedMode === 'remote'))
      submit.disabled = !changed()
    }

    localBtn.addEventListener('click', () => { stagedMode = 'local'; recompute() }, { signal: this.lifecycle })
    remoteBtn.addEventListener('click', () => { stagedMode = 'remote'; recompute() }, { signal: this.lifecycle })
    urlInput.addEventListener('input', () => { error.textContent = ''; recompute() }, { signal: this.lifecycle })

    submit.addEventListener('click', () => {
      const url = urlInput.value.trim()
      if (url) {
        let ok = false
        try { const u = new URL(url); ok = u.protocol === 'http:' || u.protocol === 'https:' } catch { ok = false }
        if (!ok) { error.textContent = 'Enter a valid http(s) URL.'; return }
      }
      conn.onApply(stagedMode, url)
    }, { signal: this.lifecycle })

    recompute()
  }
}

/** @param {'local'|'remote'} value @param {string} label @returns {HTMLButtonElement} */
function segButton(value, label) {
  const b = document.createElement('button')
  b.type = 'button'
  b.dataset.value = value
  b.textContent = label
  return b
}

/** Register the element (idempotent). */
export function defineConnection() {
  if (!customElements.get('oyl-connection')) customElements.define('oyl-connection', OylConnection)
}
