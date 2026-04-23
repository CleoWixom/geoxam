import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    // Real browser geolocation fed via DevTools Protocol — not a JS mock
    geolocation: { latitude: 52.3626, longitude: 5.1234, accuracy: 12 },
    permissions: ['geolocation'],
    // Chrome flag: browser generates a real fake media stream from within the browser process.
    // No JS patching of getUserMedia. The stream is a real MediaStream object.
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    },
  },

  projects: [
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],

  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
