/**
 * Settings DB tests — runs in REAL Chromium (vitest browser mode).
 * Real IndexedDB. Zero mocking.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { settingsDB, DEFAULTS } from '../../../src/core/db/settings'
import { closeDB } from '../../../src/core/db/index'

beforeEach(async () => {
  // Close and drop DB between tests for isolation
  closeDB()
  settingsDB.invalidateCache()
  // Wipe the real IndexedDB store
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('geoxam_db')
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve() // still fine
  })
})

describe('settingsDB — real IndexedDB', () => {
  it('returns defaults when DB is empty', async () => {
    const all = await settingsDB.getAllSettings()
    expect(all['photo.resolution']).toBe(DEFAULTS['photo.resolution'])
    expect(all['crosshair.enabled']).toBe(DEFAULTS['crosshair.enabled'])
    expect(all['mask.enabled']).toBe(DEFAULTS['mask.enabled'])
  })

  it('getSetting returns default for untouched key', async () => {
    const val = await settingsDB.getSetting('photo.quality')
    expect(val).toBe(0.85)
  })

  it('setSetting writes and reads back', async () => {
    await settingsDB.setSetting('photo.quality', 0.6)
    const val = await settingsDB.getSetting('photo.quality')
    expect(val).toBe(0.6)
  })

  it('setSetting reflects in getAllSettings', async () => {
    await settingsDB.setSetting('crosshair.enabled', false)
    const all = await settingsDB.getAllSettings()
    expect(all['crosshair.enabled']).toBe(false)
  })

  it('resetSettings restores all defaults', async () => {
    await settingsDB.setSetting('photo.quality', 0.5)
    await settingsDB.setSetting('mask.enabled', true)
    await settingsDB.resetSettings()
    expect(await settingsDB.getSetting('photo.quality')).toBe(DEFAULTS['photo.quality'])
    expect(await settingsDB.getSetting('mask.enabled')).toBe(DEFAULTS['mask.enabled'])
  })

  it('getAllSettings returns cached object on second call', async () => {
    const s1 = await settingsDB.getAllSettings()
    const s2 = await settingsDB.getAllSettings()
    expect(s1).toBe(s2) // same reference = cache hit
  })

  it('setSetting emits settings:changed event', async () => {
    const { events } = await import('../../../src/ui/events')
    const received: unknown[] = []
    const unsub = events.on('settings:changed', (p) => received.push(p))
    await settingsDB.setSetting('overlay.color', '#ff0000')
    unsub()
    expect(received).toHaveLength(1)
    expect((received[0] as { key: string; value: string }).value).toBe('#ff0000')
  })
})
