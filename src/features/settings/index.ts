/**
 * SettingsScreen — Phase 4 implementation stub
 *
 * Panels:
 *   - Photo quality (resolution, JPEG quality, camera facing)
 *   - Overlay (color, font, size, position, toggles, live preview)
 *   - Crosshair (style, color, size, opacity)
 *   - Storage (usage stats, clear, export)
 *   - Masking (enable, type, protection, set code)
 */

import { settingsDB } from '../../core/db/settings.js'
import { photosDB } from '../../core/db/photos.js'
import { foldersDB } from '../../core/db/folders.js'
import { router } from '../../ui/router.js'
import { toast } from '../../ui/toast.js'
import type { SettingsMap, ResolutionPreset, CrosshairStyle, MaskType, MaskProtection } from '../../types/index.js'
import { hashCode } from '../../core/crypto/index.js'

export class SettingsScreen {
  private container: HTMLElement | null = null
  private settings: SettingsMap | null = null

  async mount(container: HTMLElement): Promise<void> {
    this.container = container
    this.settings = await settingsDB.getAllSettings()

    container.innerHTML = `
      <div class="settings-screen">
        <header class="screen-header">
          <button class="btn-back" aria-label="Back">←</button>
          <h1>Settings</h1>
        </header>
        <div class="settings-body" id="settings-body"></div>
      </div>
    `

    container.querySelector('.btn-back')?.addEventListener('click', () => router.back())

    const body = container.querySelector<HTMLElement>('#settings-body')!
    body.appendChild(this.buildPhotoSection())
    body.appendChild(this.buildOverlaySection())
    body.appendChild(this.buildCrosshairSection())
    body.appendChild(await this.buildStorageSection())
    body.appendChild(this.buildMaskSection())
  }

  // -------------------------------------------------------------------------
  // Photo Quality
  // -------------------------------------------------------------------------
  private buildPhotoSection(): HTMLElement {
    const s = this.settings!
    const sec = buildSection('📷 Photo Quality')

    // Resolution selector
    const resPresets: ResolutionPreset[] = ['low', 'medium', 'high', 'max']
    const resLabels = { low: 'HD', medium: 'FHD', high: '4K', max: 'Max' }
    sec.appendChild(buildLabel('Resolution'))
    const resSeg = buildSegmented(resPresets, resLabels, s['photo.resolution'])
    resSeg.addEventListener('change', e => {
      const val = (e as CustomEvent<string>).detail as ResolutionPreset
      settingsDB.setSetting('photo.resolution', val)
    })
    sec.appendChild(resSeg)

    // JPEG quality slider
    sec.appendChild(buildLabel('JPEG Quality'))
    const qualSlider = buildSlider(50, 100, Math.round(s['photo.quality'] * 100), '%')
    qualSlider.addEventListener('input', (e) => {
      const val = Number((e.target as HTMLInputElement).value) / 100
      settingsDB.setSetting('photo.quality', val)
    })
    sec.appendChild(qualSlider)

    // Camera facing
    sec.appendChild(buildLabel('Camera'))
    const facingSeg = buildSegmented(['environment', 'user'], { environment: 'Back', user: 'Front' }, s['photo.facing'])
    facingSeg.addEventListener('change', e => {
      const val = (e as CustomEvent<string>).detail as 'environment' | 'user'
      settingsDB.setSetting('photo.facing', val)
    })
    sec.appendChild(facingSeg)

    return sec
  }

  // -------------------------------------------------------------------------
  // Overlay
  // -------------------------------------------------------------------------
  private buildOverlaySection(): HTMLElement {
    const s = this.settings!
    const sec = buildSection('🖊 Coordinate Overlay')

    sec.appendChild(buildToggleRow('Show overlay', s['overlay.enabled'], val =>
      settingsDB.setSetting('overlay.enabled', val)
    ))

    // Color presets
    sec.appendChild(buildLabel('Color'))
    const presets = ['#ffffff', '#ffff00', '#000000', '#00ff88', '#ff3b30']
    const colorRow = document.createElement('div')
    colorRow.className = 'color-presets'
    for (const hex of presets) {
      const dot = document.createElement('button')
      dot.className = 'color-dot' + (s['overlay.color'] === hex ? ' active' : '')
      dot.style.background = hex
      dot.setAttribute('aria-label', hex)
      dot.addEventListener('click', () => {
        colorRow.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'))
        dot.classList.add('active')
        settingsDB.setSetting('overlay.color', hex)
      })
      colorRow.appendChild(dot)
    }
    // Custom color picker
    const picker = document.createElement('input')
    picker.type = 'color'
    picker.value = s['overlay.color']
    picker.className = 'color-picker'
    picker.addEventListener('change', e => {
      settingsDB.setSetting('overlay.color', (e.target as HTMLInputElement).value)
    })
    colorRow.appendChild(picker)
    sec.appendChild(colorRow)

    // Font size
    sec.appendChild(buildLabel('Font Size'))
    sec.appendChild(buildSlider(10, 24, s['overlay.fontSize'], 'px', val =>
      settingsDB.setSetting('overlay.fontSize', val)
    ))

    // Font family
    sec.appendChild(buildLabel('Font'))
    const fontSeg = buildSegmented(
      ['monospace', 'sans-serif', 'serif'],
      { 'monospace': 'Mono', 'sans-serif': 'Sans', 'serif': 'Serif' },
      s['overlay.fontFamily']
    )
    fontSeg.addEventListener('change', e => {
      settingsDB.setSetting('overlay.fontFamily', (e as CustomEvent<string>).detail as 'monospace' | 'sans-serif' | 'serif')
    })
    sec.appendChild(fontSeg)

    // Position grid
    sec.appendChild(buildLabel('Position'))
    sec.appendChild(buildPositionPicker(s['overlay.position'], val =>
      settingsDB.setSetting('overlay.position', val)
    ))

    // Toggles
    sec.appendChild(buildToggleRow('Show accuracy', s['overlay.showAccuracy'], v => settingsDB.setSetting('overlay.showAccuracy', v)))
    sec.appendChild(buildToggleRow('Show altitude', s['overlay.showAltitude'], v => settingsDB.setSetting('overlay.showAltitude', v)))
    sec.appendChild(buildToggleRow('Show timestamp', s['overlay.showTimestamp'], v => settingsDB.setSetting('overlay.showTimestamp', v)))
    sec.appendChild(buildToggleRow('Show description', s['overlay.showDescription'], v => settingsDB.setSetting('overlay.showDescription', v)))

    return sec
  }

  // -------------------------------------------------------------------------
  // Crosshair
  // -------------------------------------------------------------------------
  private buildCrosshairSection(): HTMLElement {
    const s = this.settings!
    const sec = buildSection('🎯 Crosshair')

    sec.appendChild(buildToggleRow('Show crosshair (viewfinder only)', s['crosshair.enabled'], val =>
      settingsDB.setSetting('crosshair.enabled', val)
    ))

    sec.appendChild(buildLabel('Style'))
    const styleSeg = buildSegmented<CrosshairStyle>(
      ['cross', 'dot', 'circle', 'brackets'],
      { cross: '＋', dot: '·', circle: '⊕', brackets: '⌐' },
      s['crosshair.style']
    )
    styleSeg.addEventListener('change', e =>
      settingsDB.setSetting('crosshair.style', (e as CustomEvent<string>).detail as CrosshairStyle)
    )
    sec.appendChild(styleSeg)

    sec.appendChild(buildLabel('Size'))
    const sizeSeg = buildSegmented(
      ['small', 'medium', 'large'],
      { small: 'S', medium: 'M', large: 'L' },
      s['crosshair.size']
    )
    sizeSeg.addEventListener('change', e =>
      settingsDB.setSetting('crosshair.size', (e as CustomEvent<string>).detail as 'small' | 'medium' | 'large')
    )
    sec.appendChild(sizeSeg)

    sec.appendChild(buildLabel('Opacity'))
    sec.appendChild(buildSlider(30, 100, Math.round(s['crosshair.opacity'] * 100), '%', val =>
      settingsDB.setSetting('crosshair.opacity', val / 100)
    ))

    return sec
  }

  // -------------------------------------------------------------------------
  // Storage
  // -------------------------------------------------------------------------
  private async buildStorageSection(): Promise<HTMLElement> {
    const sec = buildSection('🗄 Storage')

    const stats = await photosDB.getStorageStats()
    const usedMB = (stats.used / 1_048_576).toFixed(1)
    const quotaMB = stats.estimate ? (stats.estimate.quota / 1_048_576).toFixed(0) : '?'
    const percent = stats.estimate
      ? Math.round((stats.estimate.usage / stats.estimate.quota) * 100)
      : 0

    sec.innerHTML += `
      <div class="storage-info">
        <div class="storage-bar">
          <div class="storage-bar-fill" style="width: ${percent}%"></div>
        </div>
        <p>${usedMB} MB used · ${stats.count} photo${stats.count !== 1 ? 's' : ''} · ~${quotaMB} MB quota</p>
      </div>
    `

    const clearBtn = document.createElement('button')
    clearBtn.className = 'btn-destructive'
    clearBtn.textContent = '🗑 Clear All Photos'
    clearBtn.addEventListener('click', async () => {
      if (!confirm(`Delete all ${stats.count} photos? This cannot be undone.`)) return
      await photosDB.deleteAll()
      toast('All photos deleted', 'success')
      // Re-render section
      const fresh = await this.buildStorageSection()
      sec.replaceWith(fresh)
    })
    sec.appendChild(clearBtn)

    return sec
  }

  // -------------------------------------------------------------------------
  // Masking
  // -------------------------------------------------------------------------
  private buildMaskSection(): HTMLElement {
    const s = this.settings!
    const sec = buildSection('🕵️ Disguise')

    sec.appendChild(buildToggleRow('Enable disguise mode', s['mask.enabled'], val =>
      settingsDB.setSetting('mask.enabled', val)
    ))

    sec.appendChild(buildLabel('Disguise as'))
    const typeSeg = buildSegmented<MaskType>(
      ['calculator', 'calendar', 'notepad'],
      { calculator: '🧮 Calc', calendar: '📅 Calendar', notepad: '📝 Notes' },
      s['mask.type']
    )
    typeSeg.addEventListener('change', e =>
      settingsDB.setSetting('mask.type', (e as CustomEvent<string>).detail as MaskType)
    )
    sec.appendChild(typeSeg)

    sec.appendChild(buildLabel('Protection'))
    const protSeg = buildSegmented<MaskProtection>(
      ['none', 'pin', 'pattern'],
      { none: 'None', pin: 'PIN', pattern: 'Pattern' },
      s['mask.protection']
    )
    protSeg.addEventListener('change', e =>
      settingsDB.setSetting('mask.protection', (e as CustomEvent<string>).detail as MaskProtection)
    )
    sec.appendChild(protSeg)

    // Set code button
    const setCodeBtn = document.createElement('button')
    setCodeBtn.className = 'btn-secondary'
    setCodeBtn.textContent = 'Set Access Code'
    setCodeBtn.addEventListener('click', async () => {
      const protection = await settingsDB.getSetting('mask.protection')
      if (protection === 'none') {
        toast('Select PIN or Pattern protection first', 'warning')
        return
      }
      if (protection === 'pin') {
        const pin = prompt('Enter new PIN (4–8 digits):')?.trim()
        if (!pin || !/^\d{4,8}$/.test(pin)) { toast('Invalid PIN', 'error'); return }
        const hash = await hashCode(pin)
        await settingsDB.setSetting('mask.codeHash', hash)
        toast('PIN set', 'success')
      }
    })
    sec.appendChild(setCodeBtn)

    return sec
  }

  unmount(): void {}
}

// =============================================================================
// Shared builder helpers
// =============================================================================

function buildSection(title: string): HTMLElement {
  const sec = document.createElement('div')
  sec.className = 'settings-section'
  const h2 = document.createElement('h2')
  h2.className = 'settings-section-title'
  h2.textContent = title
  sec.appendChild(h2)
  return sec
}

function buildLabel(text: string): HTMLElement {
  const label = document.createElement('div')
  label.className = 'settings-label'
  label.textContent = text
  return label
}

function buildToggleRow(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = document.createElement('div')
  row.className = 'toggle-row'
  row.innerHTML = `
    <span>${label}</span>
    <label class="toggle-switch">
      <input type="checkbox" ${value ? 'checked' : ''}>
      <span class="toggle-track"></span>
    </label>
  `
  row.querySelector('input')?.addEventListener('change', e => {
    onChange((e.target as HTMLInputElement).checked)
  })
  return row
}

function buildSlider(min: number, max: number, value: number, unit: string, onChange?: (v: number) => void): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'slider-row'
  const input = document.createElement('input')
  input.type = 'range'
  input.min = String(min)
  input.max = String(max)
  input.value = String(value)
  const display = document.createElement('span')
  display.className = 'slider-value'
  display.textContent = `${value}${unit}`
  input.addEventListener('input', e => {
    const v = Number((e.target as HTMLInputElement).value)
    display.textContent = `${v}${unit}`
    onChange?.(v)
  })
  wrap.appendChild(input)
  wrap.appendChild(display)
  return wrap
}

function buildSegmented<T extends string>(
  options: T[],
  labels: Record<T, string>,
  current: T
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'segmented-control'
  for (const opt of options) {
    const btn = document.createElement('button')
    btn.className = 'seg-btn' + (opt === current ? ' active' : '')
    btn.textContent = labels[opt]
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      wrap.dispatchEvent(new CustomEvent('change', { detail: opt }))
    })
    wrap.appendChild(btn)
  }
  return wrap
}

function buildPositionPicker(
  current: string,
  onChange: (v: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => void
): HTMLElement {
  const grid = document.createElement('div')
  grid.className = 'position-grid'
  const positions = [
    ['top-left', '↖'], ['top-right', '↗'],
    ['bottom-left', '↙'], ['bottom-right', '↘'],
  ] as const

  for (const [pos, icon] of positions) {
    const btn = document.createElement('button')
    btn.className = 'pos-btn' + (pos === current ? ' active' : '')
    btn.textContent = icon
    btn.setAttribute('aria-label', pos)
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      onChange(pos)
    })
    grid.appendChild(btn)
  }
  return grid
}
