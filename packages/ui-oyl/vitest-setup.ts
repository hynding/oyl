import { beforeAll } from 'vitest'

/**
 * happy-dom (v20) has no `attachInternals`. This minimal shim covers what the library
 * uses — `form`, `setFormValue`, `setValidity` — and records the last form value on the
 * host as `__formValue` so specs can assert the form-associated path. It is a test-DOM
 * polyfill only; browsers provide the real `ElementInternals`.
 */
function shimElementInternals() {
  const proto = HTMLElement.prototype as HTMLElement & { attachInternals?: () => ElementInternals }
  if (typeof proto.attachInternals === 'function') return
  proto.attachInternals = function (this: HTMLElement & { __formValue?: unknown }) {
    const host = this
    const internals = {
      get form() {
        return host.closest('form')
      },
      setFormValue(value: unknown) {
        host.__formValue = value
      },
      setValidity() {},
      checkValidity: () => true,
      reportValidity: () => true,
    }
    return internals as unknown as ElementInternals
  }
}

// @stencil/vitest tests a built output: `stencil-test` runs a dev build first, then Vitest.
beforeAll(async () => {
  shimElementInternals()
  await import('./dist/ui-oyl/ui-oyl.esm.js')
})

export {}
