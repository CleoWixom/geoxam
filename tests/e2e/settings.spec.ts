/**
 * E2E — Settings
 * Tests all 5 panels render, toggles persist across reload,
 * mask type change updates document title.
 */
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // Clean DB
  await page.evaluate(async () => {
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('geoxam_db')
      r.onsuccess = r.onerror = r.onblocked = () => res()
    })
  })
  await page.goto('/#/settings')
  await page.waitForSelector('.settings-screen')
})

test.describe('Settings — rendering', () => {
  test('shows all 5 section headers', async ({ page }) => {
    const titles = await page.locator('.settings-section-title').allTextContents()
    expect(titles.some(t => t.includes('Photo'))).toBe(true)
    expect(titles.some(t => t.includes('Overlay'))).toBe(true)
    expect(titles.some(t => t.includes('Crosshair'))).toBe(true)
    expect(titles.some(t => t.includes('Storage'))).toBe(true)
    expect(titles.some(t => t.includes('Disguise'))).toBe(true)
  })

  test('overlay preview canvas is present', async ({ page }) => {
    await expect(page.locator('.overlay-preview canvas').first()).toBeVisible()
  })

  test('crosshair preview canvas is present', async ({ page }) => {
    await expect(page.locator('.overlay-preview canvas').nth(1)).toBeVisible()
  })

  test('storage section shows photo count', async ({ page }) => {
    await expect(page.locator('.storage-info p').first()).toContainText('MB')
  })

  test('resolution segmented control has 4 options', async ({ page }) => {
    const seg = page.locator('.segmented-control').first()
    await expect(seg.locator('.seg-btn')).toHaveCount(4)
  })
})

test.describe('Settings — persistence', () => {
  test('overlay toggle persists across reload', async ({ page }) => {
    const toggle = page.locator('.toggle-row')
      .filter({ hasText: 'Show overlay' })
      .locator('input')
    const initial = await toggle.isChecked()
    await toggle.tap()
    await page.waitForTimeout(300)
    await page.goto('/#/settings')
    await page.waitForSelector('.settings-screen')
    const after = page.locator('.toggle-row')
      .filter({ hasText: 'Show overlay' })
      .locator('input')
    expect(await after.isChecked()).toBe(!initial)
    // Restore
    await after.tap()
  })

  test('crosshair toggle persists', async ({ page }) => {
    const toggle = page.locator('.toggle-row')
      .filter({ hasText: 'Show crosshair' })
      .locator('input')
    const initial = await toggle.isChecked()
    await toggle.tap()
    await page.waitForTimeout(300)
    await page.goto('/#/settings')
    await page.waitForSelector('.settings-screen')
    const after = page.locator('.toggle-row')
      .filter({ hasText: 'Show crosshair' })
      .locator('input')
    expect(await after.isChecked()).toBe(!initial)
    await after.tap()
  })

  test('JPEG quality slider persists', async ({ page }) => {
    // Quality slider is the 2nd range input (1st is resolution tabs)
    const slider = page.locator('input[type="range"]').first()
    await slider.fill('65')
    await slider.dispatchEvent('input')
    await page.waitForTimeout(400)
    await page.goto('/#/settings')
    await page.waitForSelector('.settings-screen')
    const after = page.locator('input[type="range"]').first()
    expect(await after.inputValue()).toBe('65')
    // Restore
    await after.fill('85')
    await after.dispatchEvent('input')
  })
})

test.describe('Settings — mask identity', () => {
  test('enabling disguise mode changes document title', async ({ page }) => {
    // Set type to calculator first
    const typeSeg = page.locator('.segmented-control').filter({ hasText: 'Calc' })
    await typeSeg.locator('.seg-btn', { hasText: 'Calc' }).tap()
    await page.waitForTimeout(200)

    // Enable mask
    const enableToggle = page.locator('.toggle-row')
      .filter({ hasText: 'Enable disguise mode' })
      .locator('input')
    await enableToggle.tap()
    await page.waitForTimeout(400)

    const title = await page.title()
    expect(title).toBe('Calculator')

    // Disable and restore
    await enableToggle.tap()
    await page.waitForTimeout(300)
  })

  test('switching mask type updates title immediately', async ({ page }) => {
    // Enable mask
    const enableToggle = page.locator('.toggle-row')
      .filter({ hasText: 'Enable disguise mode' })
      .locator('input')
    if (!(await enableToggle.isChecked())) await enableToggle.tap()
    await page.waitForTimeout(200)

    // Switch to Calendar
    const typeSeg = page.locator('.segmented-control').filter({ hasText: 'Cal' })
    await typeSeg.locator('.seg-btn', { hasText: 'Cal' }).tap()
    await page.waitForTimeout(300)
    expect(await page.title()).toBe('Calendar')

    // Switch to Notes
    await typeSeg.locator('.seg-btn', { hasText: 'Notes' }).tap()
    await page.waitForTimeout(300)
    expect(await page.title()).toBe('Notes')

    // Disable
    await enableToggle.tap()
    await page.waitForTimeout(300)
    expect(await page.title()).toBe('GeoXam')
  })
})
