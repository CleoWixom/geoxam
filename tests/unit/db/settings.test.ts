import { describe, it, expect, beforeEach } from 'vitest'
import { settingsDB, DEFAULTS } from '../../../src/core/db/settings'
import { closeDB } from '../../../src/core/db/index'

// fake-indexeddb resets between test files automatically via setup.ts

beforeEach(async () => {
  closeDB()
  settingsDB.invalidateCache()
})

describe('settingsDB', () => {
  it('returns defaults for all keys when DB is empty', async () => {
    const all = await settingsDB.getAllSettings()
    expect(all['photo.resolution']).toBe(DEFAULTS['photo.resolution'])
    expect(all['crosshair.enabled']).toBe(DEFAULTS['crosshair.enabled'])
    expect(all['mask.enabled']).toBe(DEFAULTS['mask.enabled'])
  })

  it('getSetting returns default for missing key', async () => {
    const val = await settingsDB.getSetting('photo.quality')
    expect(val).toBe(0.85)
  })

  it('setSetting persists and updates cache', async () => {
    await settingsDB.setSetting('photo.quality', 0.6)
    const val = await settingsDB.getSetting('photo.quality')
    expect(val).toBe(0.6)
  })

  it('setSetting updates getAllSettings cache', async () => {
    await settingsDB.setSetting('crosshair.enabled', false)
    const all = await settingsDB.getAllSettings()
    expect(all['crosshair.enabled']).toBe(false)
  })

  it('resetSettings restores all defaults', async () => {
    await settingsDB.setSetting('photo.quality', 0.5)
    await settingsDB.setSetting('mask.enabled', true)
    await settingsDB.resetSettings()

    const q = await settingsDB.getSetting('photo.quality')
    const m = await settingsDB.getSetting('mask.enabled')
    expect(q).toBe(DEFAULTS['photo.quality'])
    expect(m).toBe(DEFAULTS['mask.enabled'])
  })

  it('getAllSettings uses in-memory cache on second call', async () => {
    await settingsDB.getAllSettings()      // populate cache
    const s1 = await settingsDB.getAllSettings()
    const s2 = await settingsDB.getAllSettings()
    expect(s1).toBe(s2)                   // same object reference = cache hit
  })

  it('setSetting emits settings:changed event', async () => {
    const { events } = await import('../../../src/ui/events')
    const received: unknown[] = []
    const unsub = events.on('settings:changed', (payload) => received.push(payload))

    await settingsDB.setSetting('overlay.color', '#ff0000')
    unsub()

    expect(received).toHaveLength(1)
    expect((received[0] as { key: string; value: string }).key).toBe('overlay.color')
    expect((received[0] as { key: string; value: string }).value).toBe('#ff0000')
  })
})
