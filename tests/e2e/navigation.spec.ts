/**
 * E2E — Navigation, Settings, Gallery, DB persistence
 *
 * Camera + GPS = real hardware → manual testing on device (see docs/TESTING.md)
 * These tests run in Chromium and test everything that doesn't need camera/GPS.
 */
import { test, expect, type BrowserContext } from '@playwright/test'

// =============================================================================
// Navigation
// =============================================================================
test.describe('Router', () => {
  test('bare / redirects to #/capture', async ({ page }) => {
    await page.goto('/')
    await page.waitForURL('**/#/capture')
  })

  test('unknown hash falls back to #/capture', async ({ page }) => {
    await page.goto('/#/totally-unknown-route')
    await page.waitForURL('**/#/capture')
  })

  test('bottom nav renders 3 tabs', async ({ page }) => {
    await page.goto('/#/capture')
    await expect(page.locator('#bottom-nav button')).toHaveCount(3)
  })

  test('tap Gallery tab → #/gallery', async ({ page }) => {
    await page.goto('/#/capture')
    await page.locator('#bottom-nav button[data-route="#/gallery"]').tap()
    await page.waitForURL('**/#/gallery')
    await expect(page.locator('.gallery-root')).toBeVisible()
  })

  test('tap Settings tab → #/settings', async ({ page }) => {
    await page.goto('/#/capture')
    await page.locator('#bottom-nav button[data-route="#/settings"]').tap()
    await page.waitForURL('**/#/settings')
    await expect(page.locator('.settings-screen')).toBeVisible()
  })

  test('Settings back button returns to previous screen', async ({ page }) => {
    await page.goto('/#/gallery')
    await page.locator('#bottom-nav button[data-route="#/settings"]').tap()
    await page.waitForURL('**/#/settings')
    await page.locator('.btn-back').tap()
    // Should not be on settings anymore
    await page.waitForTimeout(300)
    expect(page.url()).not.toContain('#/settings')
  })
})

// =============================================================================
// Gallery — folder CRUD (real IndexedDB in Chromium)
// =============================================================================
test.describe('Gallery', () => {
  test('empty gallery shows All Photos folder', async ({ page }) => {
    await page.goto('/#/gallery')
    await expect(page.locator('.folder-list')).toBeVisible()
    await expect(page.locator('.folder-card').first()).toBeVisible()
  })

  test('create folder via + button', async ({ page }) => {
    await page.goto('/#/gallery')
    // Stub window.prompt
    await page.evaluate(() => {
      window.prompt = () => 'Test Folder'
    })
    await page.locator('#btn-new-folder').tap()
    await page.waitForTimeout(300)
    await expect(page.locator('.folder-card')).toContainText('Test Folder')
  })

  test('open folder navigates to folder view', async ({ page }) => {
    await page.goto('/#/gallery')
    await page.evaluate(() => { window.prompt = () => 'Folder Nav Test' })
    await page.locator('#btn-new-folder').tap()
    await page.waitForTimeout(300)
    // Click the newly created folder
    const folderCard = page.locator('.folder-card', { hasText: 'Folder Nav Test' })
    await folderCard.tap()
    await page.waitForURL(/\/#\/gallery\/\d+/)
    await expect(page.locator('.folder-view')).toBeVisible()
  })

  test('empty folder shows empty state', async ({ page }) => {
    await page.goto('/#/gallery')
    await page.evaluate(() => { window.prompt = () => 'Empty Folder' })
    await page.locator('#btn-new-folder').tap()
    await page.waitForTimeout(300)
    await page.locator('.folder-card', { hasText: 'Empty Folder' }).tap()
    await page.waitForURL(/\/#\/gallery\/\d+/)
    await expect(page.locator('.empty-state')).toBeVisible()
  })
})

// =============================================================================
// Settings — persistence across page reloads (real IndexedDB)
// =============================================================================
test.describe('Settings persistence', () => {
  test('all 5 sections render', async ({ page }) => {
    await page.goto('/#/settings')
    await page.waitForSelector('.settings-screen')
    const titles = await page.locator('.settings-section-title').allTextContents()
    expect(titles.some(t => t.includes('Photo'))).toBe(true)
    expect(titles.some(t => t.includes('Overlay'))).toBe(true)
    expect(titles.some(t => t.includes('Crosshair'))).toBe(true)
    expect(titles.some(t => t.includes('Storage'))).toBe(true)
    expect(titles.some(t => t.includes('Disguise'))).toBe(true)
  })

  test('toggle persists across reload', async ({ page }) => {
    await page.goto('/#/settings')
    await page.waitForSelector('.settings-screen')

    // Find overlay toggle and note its initial state
    const toggle = page.locator('.toggle-row').filter({ hasText: 'Show overlay' }).locator('input')
    const initialState = await toggle.isChecked()

    // Toggle it
    await toggle.tap()
    await page.waitForTimeout(200)

    // Reload and check it persisted
    await page.reload()
    await page.goto('/#/settings')
    await page.waitForSelector('.settings-screen')
    const newToggle = page.locator('.toggle-row').filter({ hasText: 'Show overlay' }).locator('input')
    expect(await newToggle.isChecked()).toBe(!initialState)

    // Restore
    await newToggle.tap()
  })

  test('quality slider persists across reload', async ({ page }) => {
    await page.goto('/#/settings')
    await page.waitForSelector('.settings-screen')

    const slider = page.locator('input[type="range"]').first()
    await slider.fill('70')
    await slider.dispatchEvent('input')
    await page.waitForTimeout(300)

    await page.reload()
    await page.goto('/#/settings')
    await page.waitForSelector('.settings-screen')

    const sliderAfter = page.locator('input[type="range"]').first()
    expect(await sliderAfter.inputValue()).toBe('70')
  })

  test('storage section shows photo count', async ({ page }) => {
    await page.goto('/#/settings')
    await page.waitForSelector('.storage-info')
    const info = await page.locator('.storage-info').textContent()
    expect(info).toMatch(/photo/)
  })
})

// =============================================================================
// Mask system — UI renders correctly
// =============================================================================
test.describe('Mask — Calculator UI', () => {
  test.beforeEach(async ({ page }) => {
    // Enable calculator mask via settings DB before navigating
    await page.goto('/#/settings')
    await page.waitForSelector('.settings-screen')
    await page.evaluate(async () => {
      const { settingsDB } = await import('/src/core/db/settings.ts')
      await settingsDB.setSetting('mask.enabled', true)
      await settingsDB.setSetting('mask.type', 'calculator')
      await settingsDB.setSetting('mask.protection', 'none')
    })
  })

  test.afterEach(async ({ page }) => {
    await page.evaluate(async () => {
      const { settingsDB } = await import('/src/core/db/settings.ts')
      await settingsDB.setSetting('mask.enabled', false)
    })
  })

  test('reload shows calculator mask', async ({ page }) => {
    await page.reload()
    await page.goto('/')
    await expect(page.locator('.mask-calculator')).toBeVisible()
  })

  test('calculator display starts at 0', async ({ page }) => {
    await page.reload()
    await page.goto('/')
    await expect(page.locator('#calc-display')).toHaveText('0')
  })

  test('tapping digits updates display', async ({ page }) => {
    await page.reload()
    await page.goto('/')
    await page.locator('.calc-key[data-key="4"]').tap()
    await page.locator('.calc-key[data-key="2"]').tap()
    await expect(page.locator('#calc-display')).toHaveText('42')
  })

  test('unlock sequence 1337= unlocks app (no protection)', async ({ page }) => {
    await page.reload()
    await page.goto('/')
    for (const k of ['1', '3', '3', '7', '=']) {
      await page.locator(`.calc-key[data-key="${k}"]`).tap()
    }
    // After unlock, normal app should mount
    await expect(page.locator('#bottom-nav')).toBeVisible({ timeout: 2000 })
  })
})
