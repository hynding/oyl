import { signal } from './reactive/signal.js'

/** Stand-in for vanilla's theme state: createDataState only echoes settings.get() in diagnostics. */
export function themeStub<T = { theme: string, mode: string }>(settings = { theme: 'classic', mode: 'system' } as T) {
  return { settings: signal(settings) }
}
