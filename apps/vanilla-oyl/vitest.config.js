import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./test/setup.js'],
    include: ['src/**/*.test.js', 'test/**/*.test.js', 'deploy/**/*.test.js', 'scripts/**/*.test.mjs'],
    passWithNoTests: true,
  },
})
