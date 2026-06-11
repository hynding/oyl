import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['modules/**/*.test.ts', 'src/**/*.test.ts'],
    passWithNoTests: true,
  },
})
