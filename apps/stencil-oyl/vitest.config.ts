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
        // Pure browser modules (link interceptor, theme applier) in plain happy-dom — no Stencil.
        test: {
          name: 'dom',
          include: ['src/**/*.dom.ts'],
          environment: 'happy-dom',
          // Disable happy-dom's real navigation so un-intercepted anchor clicks stay inert.
          environmentOptions: { happyDOM: { settings: { navigation: { disableMainFrameNavigation: true, disableChildFrameNavigation: true } } } },
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
