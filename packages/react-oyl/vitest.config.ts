import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['modules/**/*.test.{ts,tsx}', 'lib/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
    server: {
      deps: {
        // Transform the workspace-linked all-of-oyl package so its .ts
        // source files are compiled by vitest rather than treated as CJS.
        inline: ['@oyl/all-of-oyl'],
      },
    },
  },
})
