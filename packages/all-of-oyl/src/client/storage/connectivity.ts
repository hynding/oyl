import type { Connectivity } from '../../core/connectivity.js'
import type { ConnectivityWindow } from '../ports.js'

/** A Connectivity backed by the browser. */
export function createBrowserConnectivity(win: ConnectivityWindow): Connectivity {
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
