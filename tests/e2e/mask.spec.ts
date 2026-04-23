/**
 * E2E — Mask system
 * Tests all 3 disguises render and unlock correctly.
 * PIN lockout (timer) is skipped — too slow for CI.
 */
import { test, expect } from '@playwright/test'

async function enableMask(page: import('@playwright/test').Page, type: string, protection = 'none') {
  await page.goto('/')
  await page.evaluate(async () => {
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('geoxam_db')
      r.onsuccess = r.onerror = r.onblocked = () => res()
    })
  })
  // Set via IndexedDB directly for speed
  await page.goto('/#/settings')
  await page.waitForSelector('.settings-screen')
  await page.evaluate(async ({ type, protection }) => {
    const { settingsDB } = await import('/src/core/db/settings.ts')
    await settingsDB.setSetting('mask.type', type as 'calculator' | 'calendar' | 'notepad')
    await settingsDB.setSetting('mask.protection', protection as 'none' | 'pin' | 'pattern')
    await settingsDB.setSetting('mask.enabled', true)
  }, { type, protection })
  await page.reload()
  await page.waitForURL('**/')
}

async function disableMask(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    const { settingsDB } = await import('/src/core/db/settings.ts')
    await settingsDB.setSetting('mask.enabled', false)
  })
}

// =============================================================================
// Calculator
// =============================================================================
test.describe('Mask — Calculator', () => {
  test.beforeEach(async ({ page }) => enableMask(page, 'calculator'))

  test('shows calculator UI', async ({ page }) => {
    await expect(page.locator('.mask-calculator')).toBeVisible()
    await expect(page.locator('#calc-display')).toBeVisible()
  })

  test('display starts at 0', async ({ page }) => {
    await expect(page.locator('#calc-display')).toHaveText('0')
  })

  test('digit input updates display', async ({ page }) => {
    await page.locator('.calc-key[data-key="7"]').tap()
    await page.locator('.calc-key[data-key="3"]').tap()
    await expect(page.locator('#calc-display')).toHaveText('73')
  })

  test('AC clears display', async ({ page }) => {
    await page.locator('.calc-key[data-key="5"]').tap()
    await page.locator('.calc-key[data-key="AC"]').tap()
    await expect(page.locator('#calc-display')).toHaveText('0')
  })

  test('basic addition works', async ({ page }) => {
    await page.locator('.calc-key[data-key="3"]').tap()
    await page.locator('.calc-key[data-key="+"]').tap()
    await page.locator('.calc-key[data-key="4"]').tap()
    await page.locator('.calc-key[data-key="="]').tap()
    await expect(page.locator('#calc-display')).toHaveText('7')
  })

  test('unlock sequence 1337= shows normal app (no protection)', async ({ page }) => {
    for (const k of ['1', '3', '3', '7', '=']) {
      await page.locator(`.calc-key[data-key="${k}"]`).tap()
    }
    await expect(page.locator('#bottom-nav')).toBeVisible({ timeout: 3000 })
    await disableMask(page)
  })

  test('wrong sequence does not unlock', async ({ page }) => {
    for (const k of ['1', '2', '3', '4', '=']) {
      await page.locator(`.calc-key[data-key="${k}"]`).tap()
    }
    await expect(page.locator('.mask-calculator')).toBeVisible()
  })

  test('document title is Calculator', async ({ page }) => {
    expect(await page.title()).toBe('Calculator')
  })
})

// =============================================================================
// Calendar
// =============================================================================
test.describe('Mask — Calendar', () => {
  test.beforeEach(async ({ page }) => enableMask(page, 'calendar'))

  test('shows calendar UI with month nav', async ({ page }) => {
    await expect(page.locator('.mask-calendar')).toBeVisible()
    await expect(page.locator('.cal-title')).toBeVisible()
    await expect(page.locator('.cal-nav#prev, #cal-prev, .cal-nav').first()).toBeVisible()
  })

  test('today is highlighted', async ({ page }) => {
    await expect(page.locator('.cal-day.today')).toBeVisible()
  })

  test('navigating month changes title', async ({ page }) => {
    const initial = await page.locator('.cal-title').textContent()
    await page.locator('.cal-nav').first().tap()
    await page.waitForTimeout(200)
    const after = await page.locator('.cal-title').textContent()
    expect(after).not.toBe(initial)
  })

  test('triple-tap today unlocks (no protection)', async ({ page }) => {
    const today = page.locator('.cal-day.today')
    await today.tap()
    await today.tap()
    await today.tap()
    await expect(page.locator('#bottom-nav')).toBeVisible({ timeout: 3000 })
    await disableMask(page)
  })

  test('document title is Calendar', async ({ page }) => {
    expect(await page.title()).toBe('Calendar')
  })
})

// =============================================================================
// Notepad
// =============================================================================
test.describe('Mask — Notepad', () => {
  test.beforeEach(async ({ page }) => enableMask(page, 'notepad'))

  test('shows notepad UI', async ({ page }) => {
    await expect(page.locator('.mask-notepad')).toBeVisible()
    await expect(page.locator('#np-area')).toBeVisible()
  })

  test('typing updates word count', async ({ page }) => {
    const area = page.locator('#np-area')
    await area.tap()
    await area.fill('hello world test')
    await page.waitForTimeout(200)
    await expect(page.locator('#np-count')).toHaveText('3 words')
  })

  test('text persists after navigation', async ({ page }) => {
    await page.locator('#np-area').tap()
    await page.locator('#np-area').fill('persistent note')
    await page.waitForTimeout(700) // wait for debounced save
    await page.reload()
    await page.waitForSelector('.mask-notepad')
    await expect(page.locator('#np-area')).toHaveValue('persistent note')
  })

  test('document title is Notes', async ({ page }) => {
    expect(await page.title()).toBe('Notes')
  })

  test('::: trigger arms corner zone', async ({ page }) => {
    const area = page.locator('#np-area')
    await area.tap()
    await area.fill('some text:::')
    await page.waitForTimeout(200)
    // After ::: the textarea should have it removed
    const value = await area.inputValue()
    expect(value).not.toContain(':::')
  })

  test('::: + corner tap unlocks', async ({ page }) => {
    const area = page.locator('#np-area')
    await area.tap()
    await area.fill('some text:::')
    await page.waitForTimeout(100)
    // Tap the corner zone
    await page.locator('#np-corner').tap()
    await expect(page.locator('#bottom-nav')).toBeVisible({ timeout: 3000 })
    await disableMask(page)
  })
})

// =============================================================================
// PIN protection
// =============================================================================
test.describe('Mask — PIN protection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(async () => {
      await new Promise<void>((res) => {
        const r = indexedDB.deleteDatabase('geoxam_db')
        r.onsuccess = r.onerror = r.onblocked = () => res()
      })
    })
    await page.goto('/#/settings')
    await page.waitForSelector('.settings-screen')
    // Set up PIN 1234
    await page.evaluate(async () => {
      const { settingsDB } = await import('/src/core/db/settings.ts')
      const { hashCode } = await import('/src/core/crypto/index.ts')
      await settingsDB.setSetting('mask.type', 'calculator')
      await settingsDB.setSetting('mask.protection', 'pin')
      await settingsDB.setSetting('mask.codeHash', await hashCode('1234'))
      await settingsDB.setSetting('mask.enabled', true)
    })
    await page.reload()
  })

  test('PIN overlay appears after unlock trigger', async ({ page }) => {
    // Enter unlock sequence on calculator
    for (const k of ['1','3','3','7','=']) {
      await page.locator(`.calc-key[data-key="${k}"]`).tap()
    }
    await expect(page.locator('.pin-overlay')).toBeVisible({ timeout: 2000 })
  })

  test('correct PIN unlocks app', async ({ page }) => {
    for (const k of ['1','3','3','7','=']) {
      await page.locator(`.calc-key[data-key="${k}"]`).tap()
    }
    await page.waitForSelector('.pin-overlay')
    for (const k of ['1','2','3','4']) {
      await page.locator(`.pin-key[data-key="${k}"]`).tap()
    }
    await expect(page.locator('#bottom-nav')).toBeVisible({ timeout: 3000 })
    // Disable mask after test
    await page.evaluate(async () => {
      const { settingsDB } = await import('/src/core/db/settings.ts')
      await settingsDB.setSetting('mask.enabled', false)
    })
  })

  test('wrong PIN shows error message', async ({ page }) => {
    for (const k of ['1','3','3','7','=']) {
      await page.locator(`.calc-key[data-key="${k}"]`).tap()
    }
    await page.waitForSelector('.pin-overlay')
    for (const k of ['9','9','9','9']) {
      await page.locator(`.pin-key[data-key="${k}"]`).tap()
    }
    await expect(page.locator('#pin-error')).not.toBeEmpty()
    await expect(page.locator('.mask-calculator')).toBeVisible()
  })

  test('backspace removes last digit', async ({ page }) => {
    for (const k of ['1','3','3','7','=']) {
      await page.locator(`.calc-key[data-key="${k}"]`).tap()
    }
    await page.waitForSelector('.pin-overlay')
    await page.locator('.pin-key[data-key="5"]').tap()
    await page.locator('.pin-key[data-key="⌫"]').tap()
    // Only 0 dots should be filled
    const filled = page.locator('#pin-dots span.filled')
    await expect(filled).toHaveCount(0)
  })
})
