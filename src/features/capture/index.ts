/**
 * CaptureScreen — full implementation
 *
 * rAF loop: video → canvas (full DPR resolution) → crosshair overlay
 * GPS badge updates via events (no polling)
 * Capture: freeze → description sheet → composite → DB → flash → resume
 */

import { cameraService, RESOLUTION_PRESETS } from '../../core/camera/index.js'
import { geoService } from '../../core/geo/index.js'
import { settingsDB } from '../../core/db/settings.js'
import { photosDB } from '../../core/db/photos.js'
import { compositePhoto } from '../../core/canvas/compositor.js'
import { drawCrosshair } from '../../core/canvas/crosshair.js'
import { events } from '../../ui/events.js'
import { router } from '../../ui/router.js'
import { toast } from '../../ui/toast.js'
import { formatAccuracy } from '../../core/geo/formatter.js'
import type { CrosshairConfig, GeoFix, GeoStatus, SettingsMap } from '../../types/index.js'

export class CaptureScreen {
  private container: HTMLElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private video: HTMLVideoElement | null = null
  private rafId: number | null = null
  private settings: SettingsMap | null = null
  private crosshair: CrosshairConfig = {
    enabled: true, color: '#ff3b30', style: 'cross', size: 'medium', opacity: 0.85,
  }
  private unsubs: Array<() => void> = []
  private capturing = false

  async mount(container: HTMLElement): Promise<void> {
    this.container = container
    this.settings = await settingsDB.getAllSettings()
    this.syncCrosshair()
    this.buildDOM()
    this.subscribeEvents()
    geoService.start()
    await this.startCamera()
    this.loadLastThumb()
  }

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------
  private buildDOM(): void {
    this.container!.innerHTML = /* html */`
      <div class="capture-screen">
        <canvas id="viewfinder"></canvas>

        <div class="gps-badge" id="gps-badge">
          <span class="gps-dot" id="gps-dot"></span>
          <span class="gps-label" id="gps-label">Acquiring…</span>
        </div>

        <div class="capture-actions">
          <button class="btn-gallery" id="btn-gallery" aria-label="Open gallery">
            <div class="gallery-thumb" id="gallery-thumb">📷</div>
          </button>
          <button class="btn-shutter" id="btn-shutter" aria-label="Take photo">
            <div class="shutter-inner"></div>
          </button>
          <button class="btn-flip" id="btn-flip" aria-label="Flip camera">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 4v6h6M23 20v-6h-6"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M22 14l-4.64 4.36A9 9 0 0 1 3.51 15"/>
            </svg>
          </button>
        </div>
      </div>
    `

    const canvas = this.container!.querySelector<HTMLCanvasElement>('#viewfinder')!
    this.resizeCanvas(canvas)
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })!

    this.container!.querySelector('#btn-shutter')!.addEventListener('click', () => this.onCapture())
    this.container!.querySelector('#btn-gallery')!.addEventListener('click', () => router.navigate('#/gallery'))
    this.container!.querySelector('#btn-flip')!.addEventListener('click', () => this.flipCamera())

    window.addEventListener('resize', this.onResize)
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  private resizeCanvas(c: HTMLCanvasElement): void {
    const dpr = devicePixelRatio || 1
    c.width  = window.innerWidth  * dpr
    c.height = window.innerHeight * dpr
    c.style.width  = window.innerWidth  + 'px'
    c.style.height = window.innerHeight + 'px'
    if (this.ctx) this.ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  private readonly onResize = () => { if (this.canvas) this.resizeCanvas(this.canvas) }

  private readonly onVisibility = () => {
    if (document.hidden) this.stopLoop()
    else if (this.video && !this.capturing) this.startLoop()
  }

  // ---------------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------------
  private async startCamera(): Promise<void> {
    const s = this.settings!
    const preset = RESOLUTION_PRESETS[s['photo.resolution']]
    try {
      this.video = await cameraService.start({ facing: s['photo.facing'], ...preset })
      this.startLoop()
    } catch (err: unknown) {
      this.showPermissionError(err instanceof DOMException && err.name === 'NotAllowedError')
    }
  }

  private async flipCamera(): Promise<void> {
    this.stopLoop()
    const s = this.settings!
    const preset = RESOLUTION_PRESETS[s['photo.resolution']]
    try {
      this.video = await cameraService.switchFacing(preset)
      this.startLoop()
    } catch { toast('Could not switch camera', 'error') }
  }

  private showPermissionError(isDenied: boolean): void {
    this.container!.querySelector('.capture-screen')!.innerHTML = /* html */`
      <div class="permission-screen">
        <div class="perm-icon">${isDenied ? '🚫' : '📷'}</div>
        <h2>${isDenied ? 'Camera Access Denied' : 'Camera Unavailable'}</h2>
        <p>${isDenied
          ? 'Open browser settings → allow camera for this site → reload.'
          : 'No camera found on this device.'}</p>
        ${isDenied ? `<button class="btn-primary" onclick="location.reload()">Reload</button>` : ''}
      </div>
    `
  }

  // ---------------------------------------------------------------------------
  // Render loop
  // ---------------------------------------------------------------------------
  private startLoop(): void {
    if (this.rafId !== null) return
    const draw = () => {
      if (!this.video || !this.ctx || !this.canvas) return
      const { width, height } = this.canvas
      this.ctx.drawImage(this.video, 0, 0, width, height)
      if (this.crosshair.enabled) drawCrosshair(this.ctx, width, height, this.crosshair)
      this.rafId = requestAnimationFrame(draw)
    }
    this.rafId = requestAnimationFrame(draw)
  }

  private stopLoop(): void {
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null }
  }

  // ---------------------------------------------------------------------------
  // Capture flow
  // ---------------------------------------------------------------------------
  private async onCapture(): Promise<void> {
    if (this.capturing || !this.video) return
    this.capturing = true
    this.stopLoop()

    const btn = this.container!.querySelector<HTMLElement>('#btn-shutter')!
    btn.classList.add('capturing')

    try {
      const geoFix = geoService.getLatest()
      const description = await this.promptDescription()
      const frame = await createImageBitmap(this.video)
      const result = await compositePhoto(frame, geoFix, description, this.settings!)
      frame.close()

      const photoId = await photosDB.addPhoto({
        folderId: null,
        imageBlob: result.imageBlob,
        thumbnailBlob: result.thumbnailBlob,
        createdAt: Date.now(),
        size: result.size,
        metadata: fixToMeta(geoFix),
        description,
        overlayConfig: overlaySnap(this.settings!),
      })

      this.flashSuccess()
      this.updateLastThumb(result.thumbnailBlob)
      const saved = await photosDB.getPhoto(photoId)
      if (saved) events.emit('photo:saved', saved)

    } catch (err) {
      console.error('[Capture]', err)
      toast(err instanceof Error && err.message.includes('large')
        ? 'Photo too large — lower resolution in settings'
        : 'Capture failed', 'error')
    } finally {
      btn.classList.remove('capturing')
      this.capturing = false
      if (this.video) this.startLoop()
    }
  }

  private promptDescription(): Promise<string> {
    return new Promise(resolve => {
      const el = document.createElement('div')
      el.className = 'description-overlay'
      el.innerHTML = /* html */`
        <div class="description-sheet">
          <h3>Add description (optional)</h3>
          <textarea class="description-input" placeholder="Describe this location…" maxlength="200" rows="3"></textarea>
          <div class="description-actions">
            <button class="btn-skip">Skip</button>
            <button class="btn-save-photo">Save Photo</button>
          </div>
        </div>
      `
      const ta = el.querySelector<HTMLTextAreaElement>('.description-input')!
      const done = (v: string) => { el.remove(); resolve(v) }
      el.querySelector('.btn-skip')!.addEventListener('click', () => done(''))
      el.querySelector('.btn-save-photo')!.addEventListener('click', () => done(ta.value.trim()))
      el.addEventListener('click', e => { if (e.target === el) done('') })
      this.container!.querySelector('.capture-screen')!.appendChild(el)
      requestAnimationFrame(() => ta.focus())
    })
  }

  private flashSuccess(): void {
    const f = document.createElement('div')
    f.className = 'capture-flash'
    this.container!.querySelector('.capture-screen')!.appendChild(f)
    f.addEventListener('animationend', () => f.remove(), { once: true })
    if ('vibrate' in navigator) navigator.vibrate(40)
  }

  // ---------------------------------------------------------------------------
  // Last-photo thumbnail in gallery button
  // ---------------------------------------------------------------------------
  private async loadLastThumb(): Promise<void> {
    const all = await photosDB.getAllPhotos()
    if (!all.length) return
    const last = all.reduce((a, b) => a.createdAt > b.createdAt ? a : b)
    this.updateLastThumb(last.thumbnailBlob)
  }

  private updateLastThumb(blob: Blob): void {
    const el = this.container?.querySelector<HTMLElement>('#gallery-thumb')
    if (!el) return
    const prev = el.querySelector<HTMLImageElement>('img')
    if (prev?.src.startsWith('blob:')) URL.revokeObjectURL(prev.src)
    const url = URL.createObjectURL(blob)
    el.innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`
    el.querySelector('img')!.onload = () => URL.revokeObjectURL(url)
  }

  // ---------------------------------------------------------------------------
  // GPS badge
  // ---------------------------------------------------------------------------
  private onGeoStatus(status: GeoStatus): void {
    const dot   = this.container?.querySelector<HTMLElement>('#gps-dot')
    const label = this.container?.querySelector<HTMLElement>('#gps-label')
    if (!dot || !label) return
    const cls = { idle: '', acquiring: 'acquiring', ok: 'ok', error: 'error', denied: 'error' }[status]
    dot.className = 'gps-dot ' + cls
    label.textContent = { idle: '', acquiring: 'Acquiring…', ok: 'GPS', error: 'No GPS', denied: 'GPS denied' }[status]
  }

  private onGeoFix(fix: GeoFix): void {
    const dot   = this.container?.querySelector<HTMLElement>('#gps-dot')
    const label = this.container?.querySelector<HTMLElement>('#gps-label')
    if (!dot || !label) return
    dot.className = 'gps-dot ' + (fix.accuracy <= 50 ? 'ok' : 'warn')
    label.textContent = formatAccuracy(fix.accuracy)
  }

  // ---------------------------------------------------------------------------
  // Events / settings
  // ---------------------------------------------------------------------------
  private subscribeEvents(): void {
    this.unsubs.push(
      events.on('geo:status', s => this.onGeoStatus(s)),
      events.on('geo:fix',    f => this.onGeoFix(f)),
      events.on('settings:changed', ({ key }) => {
        if (key.startsWith('crosshair.') || key.startsWith('photo.')) {
          settingsDB.getAllSettings().then(s => { this.settings = s; this.syncCrosshair() })
        }
      }),
    )
  }

  private syncCrosshair(): void {
    const s = this.settings!
    this.crosshair = {
      enabled: s['crosshair.enabled'], color:  s['crosshair.color'],
      style:   s['crosshair.style'],   size:   s['crosshair.size'],
      opacity: s['crosshair.opacity'],
    }
  }

  unmount(): void {
    this.stopLoop()
    this.unsubs.forEach(fn => fn())
    this.unsubs = []
    window.removeEventListener('resize', this.onResize)
    document.removeEventListener('visibilitychange', this.onVisibility)
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function fixToMeta(fix: GeoFix | null) {
  return fix
    ? { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, altitude: fix.altitude,
        altitudeAccuracy: fix.altitudeAccuracy, heading: fix.heading, speed: fix.speed, timestamp: fix.timestamp }
    : { lat: null, lng: null, accuracy: null, altitude: null,
        altitudeAccuracy: null, heading: null, speed: null, timestamp: Date.now() }
}

function overlaySnap(s: SettingsMap) {
  return {
    enabled: s['overlay.enabled'], color: s['overlay.color'], fontSize: s['overlay.fontSize'],
    fontFamily: s['overlay.fontFamily'], position: s['overlay.position'],
    showAccuracy: s['overlay.showAccuracy'], showAltitude: s['overlay.showAltitude'],
    showTimestamp: s['overlay.showTimestamp'], showDescription: s['overlay.showDescription'],
  }
}
