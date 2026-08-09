import { classic } from './classic.js'
import { sidebar } from './sidebar.js'
import { dashboard } from './dashboard.js'
import { focus } from './focus.js'
import { wide } from './wide.js'

/**
 * The layout catalog — mirrors theme-catalog.js: one frozen descriptor per layout,
 * registered here. Adding a layout = new module in src/layouts/ + one import line.
 *
 * @typedef {'top' | 'side' | 'floating'} NavMode
 * @typedef {'rail' | 'band' | 'none'} WidgetsMode
 * @typedef {{
 *   id: string,
 *   label: string,
 *   description: string,
 *   navMode: NavMode,
 *   widgets: WidgetsMode,
 *   pageWidth: 'classic' | 'wide',
 *   styles: CSSStyleSheet,
 * }} LayoutDescriptor
 */

/** @type {LayoutDescriptor[]} Picker order. */
export const LAYOUTS = [classic, sidebar, dashboard, focus, wide]

export const DEFAULT_LAYOUT = 'classic'

/**
 * How each navMode presents the slotted oyl-nav (reflected as its `orientation`
 * attribute by the shell). `floating` is horizontal: the pill is styled from the
 * focus layout's sheet via ::slotted — oyl-nav itself has no `floating` hook.
 * @type {Record<NavMode, 'horizontal' | 'vertical'>}
 */
export const ORIENTATION = Object.freeze({ top: 'horizontal', side: 'vertical', floating: 'horizontal' })

/** @param {unknown} v @returns {boolean} */
export function isLayoutId(v) {
  return typeof v === 'string' && LAYOUTS.some((l) => l.id === v)
}

/** Unknown ids resolve to classic — never throws, never renders an empty frame. @param {string} id @returns {LayoutDescriptor} */
export function byId(id) {
  return LAYOUTS.find((l) => l.id === id) ?? classic
}
