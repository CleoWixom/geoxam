/**
 * SettingsScreen — full implementation
 * All 5 panels: Photo, Overlay (+ live preview), Crosshair, Storage, Mask
 */

import { settingsDB } from '../../core/db/settings.js'
import { photosDB } from '../../core/db/photos.js'
import { router } from '../../ui/router.js'
import { toast } from '../../ui/toast.js'
import { hashCode } from '../../core/crypto/index.js'
import { drawOverlay } from '../../core/canvas/overlay.js'
import { drawCrosshair } from '../../core/canvas/crosshair.js'
import type { SettingsMap, ResolutionPreset, CrosshairStyle, MaskType, MaskProtection } from '../../types/index.js'

export class SettingsScreen {
  private container: HTMLElement | null = null
  private settings: SettingsMap | null = null

  async mount(container: HTMLElement): Promise<void> {
    this.container = container
    this.settings = await settingsDB.getAllSettings()

    container.innerHTML = /* html */`
      <div class="settings-screen">
        <header class="screen-header">
          <button class="btn-back" aria-label="Back">←</button>
          <h1>Settings</h1>
        </header>
        <div class="settings-body" id="settings-body"></div>
      </div>
    `
    container.querySelector('.btn-back')!.addEventListener('click', () => router.back())

    const body = container.querySelector<HTMLElement>('#settings-body')!
    body.appendChild(this.buildPhotoSection())
    body.appendChild(this.buildOverlaySection())
    body.appendChild(this.buildCrosshairSection())
    body.appendChild(await this.buildStorageSection())
    body.appendChild(this.buildMaskSection())
  }

  // ---------------------------------------------------------------------------
  // Photo Quality
  // ---------------------------------------------------------------------------
  private buildPhotoSection(): HTMLElement {
    const s = this.settings!
    const sec = section('📷 Photo Quality')

    sec.appendChild(label('Resolution'))
    const res = segmented<ResolutionPreset>(
      ['low','medium','high','max'],
      { low:'HD', medium:'FHD', high:'4K', max:'Max' },
      s['photo.resolution']
    )
    res.addEventListener('change', e => settingsDB.setSetting('photo.resolution', (e as CustomEvent<string>).detail as ResolutionPreset))
    sec.appendChild(res)

    sec.appendChild(label('JPEG Quality'))
    sec.appendChild(slider(50, 100, Math.round(s['photo.quality'] * 100), '%', v =>
      settingsDB.setSetting('photo.quality', v / 100)
    ))

    sec.appendChild(label('Camera'))
    const facing = segmented(
      ['environment','user'] as const,
      { environment:'Back', user:'Front' },
      s['photo.facing']
    )
    facing.addEventListener('change', e =>
      settingsDB.setSetting('photo.facing', (e as CustomEvent<string>).detail as 'environment' | 'user')
    )
    sec.appendChild(facing)

    return sec
  }

  // ---------------------------------------------------------------------------
  // Overlay
  // ---------------------------------------------------------------------------
  private buildOverlaySection(): HTMLElement {
    const s = this.settings!
    const sec = section('🖊 Coordinate Overlay')

    const preview = this.buildOverlayPreview()
    sec.appendChild(preview)

    const refresh = () => this.refreshOverlayPreview(preview, this.settings!)

    sec.appendChild(toggleRow('Show overlay', s['overlay.enabled'], v => {
      settingsDB.setSetting('overlay.enabled', v); refresh()
    }))

    sec.appendChild(label('Color'))
    const presets = ['#ffffff','#ffff00','#000000','#00ff88','#ff3b30']
    const colorRow = document.createElement('div')
    colorRow.className = 'color-presets'
    for (const hex of presets) {
      const dot = document.createElement('button')
      dot.className = 'color-dot' + (s['overlay.color'] === hex ? ' active' : '')
      dot.style.background = hex
      dot.addEventListener('click', () => {
        colorRow.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'))
        dot.classList.add('active')
        settingsDB.setSetting('overlay.color', hex)
        this.settings = { ...this.settings!, 'overlay.color': hex }
        refresh()
      })
      colorRow.appendChild(dot)
    }
    const picker = document.createElement('input')
    picker.type = 'color'; picker.className = 'color-picker'; picker.value = s['overlay.color']
    picker.addEventListener('change', e => {
      const v = (e.target as HTMLInputElement).value
      settingsDB.setSetting('overlay.color', v)
      this.settings = { ...this.settings!, 'overlay.color': v }
      refresh()
    })
    colorRow.appendChild(picker)
    sec.appendChild(colorRow)

    sec.appendChild(label('Font Size'))
    sec.appendChild(slider(10, 24, s['overlay.fontSize'], 'px', v => {
      settingsDB.setSetting('overlay.fontSize', v)
      this.settings = { ...this.settings!, 'overlay.fontSize': v }
      refresh()
    }))

    sec.appendChild(label('Font'))
    const font = segmented(
      ['monospace','sans-serif','serif'] as const,
      { 'monospace':'Mono', 'sans-serif':'Sans', 'serif':'Serif' },
      s['overlay.fontFamily']
    )
    font.addEventListener('change', e => {
      const v = (e as CustomEvent<string>).detail as 'monospace'|'sans-serif'|'serif'
      settingsDB.setSetting('overlay.fontFamily', v)
      this.settings = { ...this.settings!, 'overlay.fontFamily': v }
      refresh()
    })
    sec.appendChild(font)

    sec.appendChild(label('Position'))
    sec.appendChild(positionPicker(s['overlay.position'], v => {
      settingsDB.setSetting('overlay.position', v)
      this.settings = { ...this.settings!, 'overlay.position': v }
      refresh()
    }))

    const bools: Array<[string, keyof SettingsMap]> = [
      ['Show accuracy', 'overlay.showAccuracy'],
      ['Show altitude', 'overlay.showAltitude'],
      ['Show timestamp', 'overlay.showTimestamp'],
      ['Show description', 'overlay.showDescription'],
    ]
    for (const [lbl, key] of bools) {
      sec.appendChild(toggleRow(lbl, s[key] as boolean, v => {
        settingsDB.setSetting(key as 'overlay.showAccuracy', v)
        this.settings = { ...this.settings!, [key]: v }
        refresh()
      }))
    }

    return sec
  }

  private buildOverlayPreview(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'overlay-preview'
    const canvas = document.createElement('canvas')
    canvas.className = 'overlay-preview-canvas'
    canvas.width = 400; canvas.height = 140
    wrap.appendChild(canvas)
    // Draw after next paint
    requestAnimationFrame(() => this.refreshOverlayPreview(wrap, this.settings!))
    return wrap
  }

  private refreshOverlayPreview(wrap: HTMLElement, s: SettingsMap): void {
    const canvas = wrap.querySelector<HTMLCanvasElement>('canvas')
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width, H = canvas.height

    // Background
    ctx.fillStyle = '#1a3a1a'
    ctx.fillRect(0, 0, W, H)
    // Fake scene
    ctx.fillStyle = '#2a6a2a'
    ctx.fillRect(0, H * 0.6, W, H * 0.4)

    drawOverlay(ctx, W, H,
      { lat: 52.3626, lng: 5.1234, accuracy: 12, altitude: 14.3, altitudeAccuracy: 2, heading: null, speed: null, timestamp: Date.now() },
      'Sample description', {
        enabled:         s['overlay.enabled'],
        color:           s['overlay.color'],
        fontSize:        Math.round(s['overlay.fontSize'] * 0.7), // scale down for preview
        fontFamily:      s['overlay.fontFamily'],
        position:        s['overlay.position'],
        showAccuracy:    s['overlay.showAccuracy'],
        showAltitude:    s['overlay.showAltitude'],
        showTimestamp:   s['overlay.showTimestamp'],
        showDescription: s['overlay.showDescription'],
      }, Date.now()
    )
  }

  // ---------------------------------------------------------------------------
  // Crosshair
  // ---------------------------------------------------------------------------
  private buildCrosshairSection(): HTMLElement {
    const s = this.settings!
    const sec = section('🎯 Crosshair')

    // Live crosshair preview canvas
    const prevWrap = document.createElement('div')
    prevWrap.className = 'overlay-preview'
    const prevCanvas = document.createElement('canvas')
    prevCanvas.className = 'overlay-preview-canvas'
    prevCanvas.width = 400; prevCanvas.height = 140
    prevWrap.appendChild(prevCanvas)
    sec.appendChild(prevWrap)

    const refreshCrosshair = () => {
      const ctx = prevCanvas.getContext('2d')!
      ctx.fillStyle = '#111'
      ctx.fillRect(0, 0, prevCanvas.width, prevCanvas.height)
      drawCrosshair(ctx, prevCanvas.width, prevCanvas.height, {
        enabled: true,
        color:   this.settings!['crosshair.color'],
        style:   this.settings!['crosshair.style'],
        size:    this.settings!['crosshair.size'],
        opacity: this.settings!['crosshair.opacity'],
      })
    }
    requestAnimationFrame(refreshCrosshair)

    sec.appendChild(toggleRow('Show crosshair on viewfinder', s['crosshair.enabled'], v =>
      settingsDB.setSetting('crosshair.enabled', v)
    ))

    sec.appendChild(label('Style'))
    const styleSeg = segmented<CrosshairStyle>(
      ['cross','dot','circle','brackets'],
      { cross:'＋', dot:'·', circle:'⊕', brackets:'⌐ ⌐' },
      s['crosshair.style']
    )
    styleSeg.addEventListener('change', e => {
      const v = (e as CustomEvent<string>).detail as CrosshairStyle
      settingsDB.setSetting('crosshair.style', v)
      this.settings = { ...this.settings!, 'crosshair.style': v }
      refreshCrosshair()
    })
    sec.appendChild(styleSeg)

    sec.appendChild(label('Color'))
    const cpWrap = document.createElement('div')
    cpWrap.className = 'color-presets'
    for (const hex of ['#ff3b30','#ffffff','#ffff00','#00ff88','#0a84ff']) {
      const dot = document.createElement('button')
      dot.className = 'color-dot' + (s['crosshair.color'] === hex ? ' active' : '')
      dot.style.background = hex
      dot.addEventListener('click', () => {
        cpWrap.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'))
        dot.classList.add('active')
        settingsDB.setSetting('crosshair.color', hex)
        this.settings = { ...this.settings!, 'crosshair.color': hex }
        refreshCrosshair()
      })
      cpWrap.appendChild(dot)
    }
    const cp2 = document.createElement('input')
    cp2.type = 'color'; cp2.className = 'color-picker'; cp2.value = s['crosshair.color']
    cp2.addEventListener('change', e => {
      const v = (e.target as HTMLInputElement).value
      settingsDB.setSetting('crosshair.color', v)
      this.settings = { ...this.settings!, 'crosshair.color': v }
      refreshCrosshair()
    })
    cpWrap.appendChild(cp2)
    sec.appendChild(cpWrap)

    sec.appendChild(label('Size'))
    const sizeSeg = segmented(
      ['small','medium','large'] as const,
      { small:'S', medium:'M', large:'L' },
      s['crosshair.size']
    )
    sizeSeg.addEventListener('change', e => {
      const v = (e as CustomEvent<string>).detail as 'small'|'medium'|'large'
      settingsDB.setSetting('crosshair.size', v)
      this.settings = { ...this.settings!, 'crosshair.size': v }
      refreshCrosshair()
    })
    sec.appendChild(sizeSeg)

    sec.appendChild(label('Opacity'))
    sec.appendChild(slider(30, 100, Math.round(s['crosshair.opacity'] * 100), '%', v => {
      settingsDB.setSetting('crosshair.opacity', v / 100)
      this.settings = { ...this.settings!, 'crosshair.opacity': v / 100 }
      refreshCrosshair()
    }))

    return sec
  }

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------
  private async buildStorageSection(): Promise<HTMLElement> {
    const sec = section('🗄 Storage')
    const stats = await photosDB.getStorageStats()
    const usedMB = (stats.used / 1_048_576).toFixed(1)
    const quota = stats.estimate?.quota ?? 0
    const usage = stats.estimate?.usage ?? 0
    const quotaMB = quota ? (quota / 1_048_576).toFixed(0) : '?'
    const pct = quota ? Math.min(Math.round((usage / quota) * 100), 100) : 0
    const fillClass = pct > 80 ? 'danger' : pct > 60 ? 'warn' : ''

    const infoDiv = document.createElement('div')
    infoDiv.className = 'storage-info'
    infoDiv.innerHTML = /* html */`
      <div class="storage-bar">
        <div class="storage-bar-fill ${fillClass}" style="width:${pct}%"></div>
      </div>
      <p>${usedMB} MB used by photos · ~${quotaMB} MB available</p>
      <p>${stats.count} photo${stats.count !== 1 ? 's' : ''}</p>
    `
    sec.appendChild(infoDiv)

    const clearBtn = document.createElement('button')
    clearBtn.className = 'btn-destructive'
    clearBtn.textContent = '🗑 Clear All Photos'
    clearBtn.addEventListener('click', async () => {
      if (!confirm(`Delete all ${stats.count} photos? This cannot be undone.`)) return
      await photosDB.deleteAll()
      toast('All photos deleted', 'success')
      const fresh = await this.buildStorageSection()
      sec.replaceWith(fresh)
    })
    sec.appendChild(clearBtn)
    return sec
  }

  // ---------------------------------------------------------------------------
  // Mask
  // ---------------------------------------------------------------------------
  private buildMaskSection(): HTMLElement {
    const s = this.settings!
    const sec = section('🕵️ Disguise')

    sec.appendChild(toggleRow('Enable disguise mode', s['mask.enabled'], v =>
      settingsDB.setSetting('mask.enabled', v)
    ))

    sec.appendChild(label('Disguise as'))
    const typeSeg = segmented<MaskType>(
      ['calculator','calendar','notepad'],
      { calculator:'🧮 Calc', calendar:'📅 Cal', notepad:'📝 Notes' },
      s['mask.type']
    )
    typeSeg.addEventListener('change', e =>
      settingsDB.setSetting('mask.type', (e as CustomEvent<string>).detail as MaskType)
    )
    sec.appendChild(typeSeg)

    sec.appendChild(label('Access protection'))
    const protSeg = segmented<MaskProtection>(
      ['none','pin','pattern'],
      { none:'None', pin:'PIN', pattern:'Pattern' },
      s['mask.protection']
    )
    protSeg.addEventListener('change', e =>
      settingsDB.setSetting('mask.protection', (e as CustomEvent<string>).detail as MaskProtection)
    )
    sec.appendChild(protSeg)

    const setCodeBtn = document.createElement('button')
    setCodeBtn.className = 'btn-secondary'
    setCodeBtn.textContent = 'Set Access Code'
    setCodeBtn.addEventListener('click', async () => {
      const prot = await settingsDB.getSetting('mask.protection')
      if (prot === 'none') { toast('Select PIN or Pattern first', 'warning'); return }
      if (prot === 'pin') {
        const pin = prompt('New PIN (4–8 digits):')?.trim()
        if (!pin || !/^\d{4,8}$/.test(pin)) { toast('Invalid PIN', 'error'); return }
        await settingsDB.setSetting('mask.codeHash', await hashCode(pin))
        toast('PIN saved', 'success')
      }
    })
    sec.appendChild(setCodeBtn)

    return sec
  }

  unmount(): void {}
}

// =============================================================================
// Builder helpers (pure DOM, no state)
// =============================================================================
function section(title: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'settings-section'
  el.innerHTML = `<div class="settings-section-title">${title}</div>`
  return el
}

function label(text: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'settings-label'
  el.textContent = text
  return el
}

function toggleRow(lbl: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = document.createElement('div')
  row.className = 'toggle-row'
  row.innerHTML = `
    <span>${lbl}</span>
    <label class="toggle-switch">
      <input type="checkbox" ${value ? 'checked' : ''}>
      <span class="toggle-track"></span>
    </label>
  `
  row.querySelector('input')!.addEventListener('change', e =>
    onChange((e.target as HTMLInputElement).checked)
  )
  return row
}

function slider(min: number, max: number, value: number, unit: string, onChange?: (v: number) => void): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'slider-row'
  const input = document.createElement('input')
  input.type = 'range'; input.min = String(min); input.max = String(max); input.value = String(value)
  const display = document.createElement('span')
  display.className = 'slider-value'
  display.textContent = `${value}${unit}`
  input.addEventListener('input', e => {
    const v = Number((e.target as HTMLInputElement).value)
    display.textContent = `${v}${unit}`
    onChange?.(v)
  })
  wrap.appendChild(input); wrap.appendChild(display)
  return wrap
}

function segmented<T extends string>(
  options: readonly T[], labels: Record<T, string>, current: T
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

function positionPicker(
  current: string,
  onChange: (v: 'top-left'|'top-right'|'bottom-left'|'bottom-right') => void
): HTMLElement {
  const grid = document.createElement('div')
  grid.className = 'position-grid'
  const positions = [['top-left','↖'],['top-right','↗'],['bottom-left','↙'],['bottom-right','↘']] as const
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
