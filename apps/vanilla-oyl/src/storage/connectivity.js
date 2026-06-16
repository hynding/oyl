/**
 * A Connectivity backed by the browser. @param {Window} win
 * @returns {import('@oyl/all-of-oyl').Connectivity}
 */
export function createBrowserConnectivity(win) {
  return {
    isOnline: () => win.navigator.onLine,
    subscribe(cb) {
      const on = () => cb(true)
      const off = () => cb(false)
      win.addEventListener('online', on)
      win.addEventListener('offline', off)
      return () => {
        win.removeEventListener('online', on)
        win.removeEventListener('offline', off)
      }
    },
  }
}
