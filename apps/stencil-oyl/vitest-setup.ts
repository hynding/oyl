import { beforeAll } from 'vitest'

/**
 * happy-dom (v20) has no `attachInternals`; ui-oyl's form-associated primitives need the
 * members below. Same shim as packages/ui-oyl/vitest-setup.ts.
 */
function shimElementInternals() {
  const proto = HTMLElement.prototype as HTMLElement & { attachInternals?: () => ElementInternals }
  if (typeof proto.attachInternals === 'function') return
  proto.attachInternals = function (this: HTMLElement & { __formValue?: unknown }) {
    const host = this
    return {
      get form() { return host.closest('form') },
      setFormValue(value: unknown) { host.__formValue = value },
      setValidity() {},
      checkValidity: () => true,
      reportValidity: () => true,
    } as unknown as ElementInternals
  }
}

beforeAll(async () => {
  shimElementInternals()
  // The bundle's global script registers the ui-* elements it uses.
  await import('./www/build/oyl.esm.js')
})

/**
 * The bundle's reactive core (one instance shared with every component). Specs that
 * create signals MUST use this — a signal from a second copy never notifies a component.
 */
export async function core(): Promise<{ signal: typeof import('@oyl/all-of-oyl/client').signal }> {
  return import('./www/build/index.esm.js') as any
}

export {}
