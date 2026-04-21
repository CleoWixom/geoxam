import { defineConfig } from 'vitest/config'

/**
 * Browser test config — runs in real Chromium via Playwright.
 * Used for tests that need actual browser APIs:
 *   - IndexedDB (real, not fake)
 *   - SubtleCrypto (real Web Crypto)
 *   - OffscreenCanvas
 *
 * No mocks. No fake-indexeddb. Real browser APIs.
 */
export default defineConfig({
  test: {
    name: 'browser',
    browser: {
      enabled: true,
      name: 'chromium',
      provider: 'playwright',
      headless: true,
    },
    include: [
      'tests/unit/db/**/*.test.ts',
    ],
    // No setupFiles — zero mocking
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/core/db/**'],
    },
  },
  resolve: {
    alias: {
      '@core': '/src/core',
      '@ui': '/src/ui',
    },
  },
})
