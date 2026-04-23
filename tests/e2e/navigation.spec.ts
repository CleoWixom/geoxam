/**
 * E2E — Router & Navigation
 * Pure navigation tests: no camera, no GPS needed.
 */
import { test, expect } from '@playwright/test'

test.describe('Router', () => {
  test('bare / redirects to #/capture', async ({ page }) => {
    await page.goto('/')
    await page.waitForURL('**/#/capture')
  })

  test('unknown hash falls back to #/capture', async ({ page }) => {
    await page.goto('/#/does-not-exist')
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

  test('Settings back button leaves settings', async ({ page }) => {
    await page.goto('/#/settings')
    await page.waitForSelector('.settings-screen')
    await page.locator('.btn-back').tap()
    await page.waitForTimeout(400)
    expect(page.url()).not.toContain('#/settings')
  })

  test('direct navigation to #/gallery/:id that does not exist shows empty', async ({ page }) => {
    await page.goto('/#/gallery/99999')
    await page.waitForSelector('.folder-view')
    await expect(page.locator('.empty-state')).toBeVisible()
  })
})
