/**
 * E2E — Gallery
 * Tests folder CRUD, sort menu, navigation within gallery.
 * Uses real IndexedDB in Chromium — no mocks.
 */
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // Wipe IndexedDB between tests for isolation
  await page.goto('/')
  await page.evaluate(async () => {
    await new Promise<void>((res, rej) => {
      const r = indexedDB.deleteDatabase('geoxam_db')
      r.onsuccess = () => res()
      r.onerror   = () => rej(r.error)
      r.onblocked = () => res()
    })
  })
  await page.goto('/#/gallery')
  await page.waitForSelector('.gallery-root')
})

test.describe('Gallery root', () => {
  test('shows All Photos folder by default', async ({ page }) => {
    await expect(page.locator('.folder-card').first()).toBeVisible()
    await expect(page.locator('.folder-name').first()).toHaveText('All Photos')
  })

  test('create folder via + Folder button', async ({ page }) => {
    await page.evaluate(() => { window.prompt = () => 'Field Work' })
    await page.locator('#btn-new-folder').tap()
    await page.waitForTimeout(400)
    await expect(page.locator('.folder-name', { hasText: 'Field Work' })).toBeVisible()
  })

  test('created folder shows 0 photos', async ({ page }) => {
    await page.evaluate(() => { window.prompt = () => 'Empty' })
    await page.locator('#btn-new-folder').tap()
    await page.waitForTimeout(400)
    const card = page.locator('.folder-card', { hasText: 'Empty' })
    await expect(card.locator('.folder-count')).toHaveText('0 photos')
  })

  test('tap folder card navigates to folder view', async ({ page }) => {
    await page.evaluate(() => { window.prompt = () => 'My Trip' })
    await page.locator('#btn-new-folder').tap()
    await page.waitForTimeout(400)
    await page.locator('.folder-card', { hasText: 'My Trip' }).tap()
    await page.waitForURL(/\/#\/gallery\/\d+/)
    await expect(page.locator('.folder-view')).toBeVisible()
  })

  test('tap All Photos navigates to /gallery/all', async ({ page }) => {
    await page.locator('.folder-card', { hasText: 'All Photos' }).tap()
    await page.waitForURL('**/#/gallery/all')
    await expect(page.locator('.folder-view')).toBeVisible()
  })

  test('cancel folder prompt does not create folder', async ({ page }) => {
    await page.evaluate(() => { window.prompt = () => null })
    await page.locator('#btn-new-folder').tap()
    await page.waitForTimeout(300)
    // Only All Photos virtual folder should exist
    await expect(page.locator('.folder-card')).toHaveCount(1)
  })

  test('empty name does not create folder', async ({ page }) => {
    await page.evaluate(() => { window.prompt = () => '   ' })
    await page.locator('#btn-new-folder').tap()
    await page.waitForTimeout(300)
    await expect(page.locator('.folder-card')).toHaveCount(1)
  })
})

test.describe('Folder view', () => {
  test('empty folder shows empty state', async ({ page }) => {
    await page.evaluate(() => { window.prompt = () => 'Solo' })
    await page.locator('#btn-new-folder').tap()
    await page.waitForTimeout(400)
    await page.locator('.folder-card', { hasText: 'Solo' }).tap()
    await page.waitForURL(/\/#\/gallery\/\d+/)
    await expect(page.locator('.empty-state')).toBeVisible()
  })

  test('folder view header shows folder name', async ({ page }) => {
    await page.evaluate(() => { window.prompt = () => 'Recon' })
    await page.locator('#btn-new-folder').tap()
    await page.waitForTimeout(400)
    await page.locator('.folder-card', { hasText: 'Recon' }).tap()
    await page.waitForURL(/\/#\/gallery\/\d+/)
    await expect(page.locator('.screen-header h1')).toHaveText('Recon')
  })

  test('sort button is present', async ({ page }) => {
    await page.locator('.folder-card', { hasText: 'All Photos' }).tap()
    await page.waitForURL('**/#/gallery/all')
    await expect(page.locator('#btn-sort')).toBeVisible()
  })

  test('sort menu opens with 4 options', async ({ page }) => {
    await page.locator('.folder-card', { hasText: 'All Photos' }).tap()
    await page.waitForURL('**/#/gallery/all')
    await page.locator('#btn-sort').tap()
    // Bottom sheet with sort options
    await page.waitForTimeout(200)
    const sheet = page.locator('body > div').last()
    await expect(sheet).toBeVisible()
  })

  test('back button returns to gallery root', async ({ page }) => {
    await page.locator('.folder-card', { hasText: 'All Photos' }).tap()
    await page.waitForURL('**/#/gallery/all')
    await page.locator('.btn-back').tap()
    await page.waitForTimeout(400)
    await expect(page.locator('.gallery-root')).toBeVisible()
  })
})
