import { beforeAll } from 'vitest'
import { defineCustomElements } from '@oyl/ui-oyl/loader'

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
  defineCustomElements()
  await import('./www/build/oyl.esm.js')
})

export {}
