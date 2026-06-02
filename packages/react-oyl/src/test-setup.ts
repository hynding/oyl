import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'

// jsdom does not implement HTMLMediaElement.prototype.play and returns
// undefined. Polyfill it as a no-op resolved Promise so awaiting/.catch()
// patterns in production code do not blow up in tests.
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = function play() {
    return Promise.resolve()
  }
  HTMLMediaElement.prototype.pause = function pause() {
    /* no-op */
  }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})
