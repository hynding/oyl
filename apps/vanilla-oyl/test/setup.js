// @ts-nocheck
// happy-dom capability shims. Logic is tested here; visual CSS only in a real browser.
if (typeof globalThis.crypto?.randomUUID !== 'function') {
  globalThis.crypto ??= /** @type {Crypto} */ ({})
  let n = 0
  globalThis.crypto.randomUUID = () =>
    `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
}

if (typeof globalThis.matchMedia !== 'function') {
  globalThis.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })
}

if (typeof document !== 'undefined' && typeof document.startViewTransition !== 'function') {
  document.startViewTransition = (cb) => {
    const ready = Promise.resolve()
    cb?.()
    return { ready, finished: ready, updateCallbackDone: ready, skipTransition() {} }
  }
}
