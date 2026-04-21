import { defineConfig } from 'vitest/config'

/**
 * Unit test config — runs in Node.js environment.
 * ONLY for pure functions with zero browser API dependencies:
 *   - src/core/geo/formatter.ts
 *   - src/core/crypto/index.ts
 *
 * DB tests (IndexedDB) → vitest.browser.config.ts (real Chromium)
 * Full flows          → playwright.config.ts (E2E)
 */
export default defineConfig({
  test: {
    name: 'unit',
    environment: 'node',
    include: [
      'tests/unit/geo/**/*.test.ts',
      'tests/unit/crypto/**/*.test.ts',
    ],
    // No setup files — no mocks, no fake APIs
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/core/geo/formatter.ts', 'src/core/crypto/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@core': '/src/core',
      '@ui': '/src/ui',
    },
  },
})
