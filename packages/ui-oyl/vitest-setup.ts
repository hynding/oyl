import { beforeAll } from 'vitest'

// @stencil/vitest tests a built output: `stencil-test` runs a dev build first, then Vitest.
beforeAll(async () => {
  await import('./dist/ui-oyl/ui-oyl.esm.js')
})

export {}
