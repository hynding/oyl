/**
 * Coalesce rapid calls into one trailing invocation after `ms`.
 * @template {any[]} A
 * @param {(...a: A) => void} fn
 * @param {number} ms
 * @returns {(...a: A) => void}
 */
export function debounce(fn, ms) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let t
  return (...a) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...a), ms)
  }
}
