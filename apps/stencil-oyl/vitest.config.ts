import { defineVitestConfig } from '@stencil/vitest/config'

export default defineVitestConfig({
  stencilConfig: './stencil.config.ts',
  test: {
    projects: [
      {
        // File-level guards (theme parity, token usage, domain-agnostic). No build needed.
        test: {
          name: 'unit',
          include: ['src/**/*.unit.ts'],
          environment: 'node',
        },
      },
      {
        // Component specs against the dev lazy-loader build (see vitest-setup.ts).
        test: {
          name: 'spec',
          include: ['src/**/*.spec.tsx'],
          environment: 'stencil',
          environmentOptions: { stencil: { domEnvironment: 'happy-dom' } },
          setupFiles: ['./vitest-setup.ts'],
        },
      },
    ],
  },
})
