import { test, expect, type Page } from '@playwright/test'

// =============================================================================
// Mock Helpers
// =============================================================================

async function grantPermissions(page: Page): Promise<void> {
  // Grant camera + geolocation permissions before navigating
  await page.context().grantPermissions(['camera', 'geolocation'])
}

async function mockGeolocation(page: Page): Promise<void> {
  await page.context().setGeolocation({ latitude: 52.3626, longitude: 5.1234, accuracy: 12 })
}

async function mockCamera(page: Page): Promise<void> {
  // Override getUserMedia to return a static canvas stream
  await page.addInitScript(() => {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints?.video) {
        // Create a canvas-based fake stream
        const canvas = document.createElement('canvas')
        canvas.width = 640
        canvas.height = 480
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#1a1a2e'
        ctx.fillRect(0, 0, 640, 480)
        // Animate slightly so video appears active
        setInterval(() => {
          ctx.fillStyle = `hsl(${Date.now() / 10 % 360}, 50%, 15%)`
          ctx.fillRect(0, 0, 640, 480)
        }, 100)
        return canvas.captureStream(10) as unknown as MediaStream
      }
      return originalGetUserMedia(constraints)
    }
  })
}

// =============================================================================
// Tests
// =============================================================================

test.describe('Capture Screen', () => {
  test.beforeEach(async ({ page }) => {
    await grantPermissions(page)
    await mockGeolocation(page)
    await mockCamera(page)
    await page.goto('/')
  })

  test('loads and shows viewfinder canvas', async ({ page }) => {
    await page.waitForSelector('#viewfinder', { timeout: 5000 })
    const canvas = page.locator('#viewfinder')
    await expect(canvas).toBeVisible()
  })

  test('GPS badge is visible', async ({ page }) => {
    await page.waitForSelector('.gps-badge', { timeout: 5000 })
    await expect(page.locator('.gps-badge')).toBeVisible()
  })

  test('shutter button is present and tappable', async ({ page }) => {
    const shutter = page.locator('#btn-shutter')
    await expect(shutter).toBeVisible()
    // Tap it — should not throw
    await shutter.tap()
  })

  test('bottom nav shows all three tabs', async ({ page }) => {
    const nav = page.locator('#bottom-nav')
    await expect(nav.locator('button')).toHaveCount(3)
  })

  test('navigates to gallery on tab tap', async ({ page }) => {
    await page.locator('#bottom-nav button[data-route="#/gallery"]').tap()
    await page.waitForURL('**/#/gallery', { timeout: 3000 })
    await expect(page.locator('.gallery-root')).toBeVisible()
  })

  test('navigates to settings on tab tap', async ({ page }) => {
    await page.locator('#bottom-nav button[data-route="#/settings"]').tap()
    await page.waitForURL('**/#/settings', { timeout: 3000 })
    await expect(page.locator('.settings-screen')).toBeVisible()
  })
})

test.describe('Gallery (empty state)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/gallery')
  })

  test('shows gallery root', async ({ page }) => {
    await page.waitForSelector('.gallery-root', { timeout: 5000 })
    await expect(page.locator('.gallery-root')).toBeVisible()
  })

  test('shows All Photos virtual folder', async ({ page }) => {
    await expect(page.locator('.folder-list')).toBeVisible()
  })
})

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/settings')
    await page.waitForSelector('.settings-screen', { timeout: 5000 })
  })

  test('shows all sections', async ({ page }) => {
    const titles = await page.locator('.settings-section-title').allTextContents()
    expect(titles.some(t => t.includes('Photo'))).toBe(true)
    expect(titles.some(t => t.includes('Overlay'))).toBe(true)
    expect(titles.some(t => t.includes('Crosshair'))).toBe(true)
    expect(titles.some(t => t.includes('Storage'))).toBe(true)
    expect(titles.some(t => t.includes('Disguise'))).toBe(true)
  })

  test('back button navigates away', async ({ page }) => {
    await page.locator('.btn-back').tap()
    // Should land somewhere that isn't settings
    await page.waitForTimeout(500)
    const url = page.url()
    expect(url).not.toContain('#/settings')
  })
})
