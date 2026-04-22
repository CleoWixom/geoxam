import { getDB } from './index.js'
import { events } from '../../ui/events.js'
import type { SettingKey, SettingValue, SettingsMap } from '../../types/index.js'

// =============================================================================
// Default values for all settings
// =============================================================================
export const DEFAULTS: SettingsMap = {
  // Photo
  'photo.resolution':       'high',
  'photo.quality':          0.85,
  'photo.facing':           'environment',

  // Overlay
  'overlay.enabled':        true,
  'overlay.color':          '#ffffff',
  'overlay.fontSize':       14,
  'overlay.fontFamily':     'monospace',
  'overlay.position':       'bottom-left',
  'overlay.showAccuracy':   true,
  'overlay.showAltitude':   false,
  'overlay.showTimestamp':  true,
  'overlay.showDescription':true,

  // Crosshair
  'crosshair.enabled':      true,
  'crosshair.color':        '#ff3b30',
  'crosshair.style':        'cross',
  'crosshair.size':         'medium',
  'crosshair.opacity':      0.85,

  // Mask
  'mask.enabled':           false,
  'mask.type':              'calculator',
  'mask.protection':        'none',
  'mask.codeHash':          '',
  'mask.unlockSequence':    '1337=',
  'mask.notepadContent':    '',
}

// =============================================================================
// Settings Service
// =============================================================================
class SettingsService {
  private cache: SettingsMap | null = null

  /** Load all settings from DB (with defaults for missing keys). Cached. */
  async getAllSettings(): Promise<SettingsMap> {
    if (this.cache) return this.cache

    const db = await getDB()
    const all = await db.getAll('settings')

    const result = { ...DEFAULTS } as SettingsMap
    for (const row of all) {
      if (row.key in result) {
        ;(result as unknown as Record<string, unknown>)[row.key] = row.value
      }
    }

    this.cache = result
    return result
  }

  /** Get a single setting value */
  async getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const all = await this.getAllSettings()
    return all[key] as SettingValue<K>
  }

  /** Write a setting value to DB and update in-memory cache */
  async setSetting<K extends SettingKey>(key: K, value: SettingValue<K>): Promise<void> {
    const db = await getDB()
    await db.put('settings', { key, value })

    if (this.cache) {
      ;(this.cache as unknown as Record<string, unknown>)[key] = value
    }

    events.emit('settings:changed', { key, value })
  }

  /** Reset all settings to defaults */
  async resetSettings(): Promise<void> {
    const db = await getDB()
    const tx = db.transaction('settings', 'readwrite')
    await tx.store.clear()
    await tx.done

    this.cache = { ...DEFAULTS }
  }

  /** Invalidate cache (call after external DB change) */
  invalidateCache(): void {
    this.cache = null
  }
}

export const settingsDB = new SettingsService()
