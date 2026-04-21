import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/core/**', 'src/features/**/mask/**'],
    },
    setupFiles: ['tests/unit/setup.ts'],
  },
  resolve: {
    alias: {
      '@core': '/src/core',
      '@features': '/src/features',
      '@ui': '/src/ui',
    },
  },
})
