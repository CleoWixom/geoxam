/**
 * CaptureScreen — Phase 2 implementation stub
 *
 * Responsibilities:
 *  - Start camera stream via CameraService
 *  - Start GPS via GeoService
 *  - Run rAF render loop: video → canvas + crosshair
 *  - Handle capture button:
 *      freeze viewfinder → optional description input →
 *      compositePhoto() → db.addPhoto() → success flash → resume rAF
 *  - GPS badge: subscribe to geo:fix + geo:status events
 *  - Settings: subscribe to settings:changed for live crosshair updates
 */

import { cameraService, RESOLUTION_PRESETS } from '../../core/camera/index.js'
import { geoService } from '../../core/geo/index.js'
import { settingsDB } from '../../core/db/settings.js'
import { photosDB } from '../../core/db/photos.js'
import { compositePhoto } from '../../core/canvas/compositor.js'
import { drawCrosshair } from '../../core/canvas/crosshair.js'
import { events } from '../../ui/events.js'
import { toast } from '../../ui/toast.js'
import type { CrosshairConfig, GeoStatus, SettingsMap } from '../../types/index.js'

export class CaptureScreen {
  private container: HTMLElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private rafId: number | null = null
  private settings: SettingsMap | null = null
  private crosshairConfig: CrosshairConfig = {
    enabled: true, color: '#ff3b30', style: 'cross', size: 'medium', opacity: 0.85
  }
  private unsubscribers: Array<() => void> = []

  async mount(container: HTMLElement): Promise<void> {
    this.container = container
    this.settings = await settingsDB.getAllSettings()
    this.syncCrosshairConfig()

    container.innerHTML = /* html */`
      <div class="capture-screen">
        <canvas id="viewfinder"></canvas>
        <div class="gps-badge" id="gps-badge">
          <span class="gps-dot"></span>
          <span class="gps-label">Acquiring…</span>
        </div>
        <div class="capture-actions">
          <button class="btn-gallery" id="btn-gallery" aria-label="Open gallery">
            <div class="gallery-thumb" id="gallery-thumb"></div>
          </button>
          <button class="btn-shutter" id="btn-shutter" aria-label="Capture photo">
            <div class="shutter-inner"></div>
          </button>
          <button class="btn-flip" id="btn-flip" aria-label="Flip camera">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 4v6h6M23 20v-6h-6"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
            </svg>
          </button>
        </div>
      </div>
    `

    // TODO Phase 2: wire up canvas, camera start, rAF loop, shutter handler
    // Placeholder: show "Phase 2 — implementation pending"
    const canvas = container.querySelector<HTMLCanvasElement>('#viewfinder')!
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')

    this.subscribeEvents()
    geoService.start()

    // Start camera
    try {
      const preset = RESOLUTION_PRESETS[this.settings!['photo.resolution']]
      const video = await cameraService.start({
        facing: this.settings!['photo.facing'],
        width: preset.width,
        height: preset.height,
      })
      this.startRenderLoop(video)
    } catch (err) {
      toast('Camera unavailable', 'error')
      console.error('[CaptureScreen] Camera error:', err)
    }

    // Shutter
    container.querySelector('#btn-shutter')?.addEventListener('click', () => this.onCapture())
    container.querySelector('#btn-gallery')?.addEventListener('click', () => {
      import('../../ui/router.js').then(({ router }) => router.navigate('#/gallery'))
    })
  }

  private startRenderLoop(video: HTMLVideoElement): void {
    const render = () => {
      if (!this.ctx || !this.canvas) return
      this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height)
      drawCrosshair(this.ctx, this.canvas.width, this.canvas.height, this.crosshairConfig)
      this.rafId = requestAnimationFrame(render)
    }
    this.rafId = requestAnimationFrame(render)
  }

  private async onCapture(): Promise<void> {
    if (!this.canvas) return

    const video = cameraService.getVideoElement()
    if (!video) { toast('Camera not ready', 'error'); return }

    // Freeze rAF
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }

    // Capture frame
    const frame = await createImageBitmap(video)
    const geoFix = geoService.getLatest()
    const settings = this.settings ?? await settingsDB.getAllSettings()

    try {
      const result = await compositePhoto(frame, geoFix, '', settings)
      await photosDB.addPhoto({
        folderId: null,
        imageBlob: result.imageBlob,
        thumbnailBlob: result.thumbnailBlob,
        createdAt: Date.now(),
        size: result.size,
        metadata: {
          lat: geoFix?.lat ?? null, lng: geoFix?.lng ?? null,
          accuracy: geoFix?.accuracy ?? null, altitude: geoFix?.altitude ?? null,
          altitudeAccuracy: geoFix?.altitudeAccuracy ?? null,
          heading: geoFix?.heading ?? null, speed: geoFix?.speed ?? null,
          timestamp: geoFix?.timestamp ?? Date.now(),
        },
        description: '',
        overlayConfig: {
          enabled: settings['overlay.enabled'], color: settings['overlay.color'],
          fontSize: settings['overlay.fontSize'], fontFamily: settings['overlay.fontFamily'],
          position: settings['overlay.position'], showAccuracy: settings['overlay.showAccuracy'],
          showAltitude: settings['overlay.showAltitude'], showTimestamp: settings['overlay.showTimestamp'],
          showDescription: settings['overlay.showDescription'],
        },
      })
      toast('Photo saved', 'success', { duration: 1500 })
    } catch (err) {
      toast('Capture failed', 'error')
      console.error('[CaptureScreen] Capture error:', err)
    }

    // Resume
    const vid = cameraService.getVideoElement()
    if (vid) this.startRenderLoop(vid)
  }

  private syncCrosshairConfig(): void {
    if (!this.settings) return
    this.crosshairConfig = {
      enabled: this.settings['crosshair.enabled'],
      color: this.settings['crosshair.color'],
      style: this.settings['crosshair.style'],
      size: this.settings['crosshair.size'],
      opacity: this.settings['crosshair.opacity'],
    }
  }

  private subscribeEvents(): void {
    this.unsubscribers.push(
      events.on('settings:changed', ({ key }) => {
        if (key.startsWith('crosshair.')) {
          settingsDB.getAllSettings().then(s => {
            this.settings = s
            this.syncCrosshairConfig()
          })
        }
      }),
      events.on('geo:status', (status: GeoStatus) => this.updateGpsBadge(status)),
    )
  }

  private updateGpsBadge(status: GeoStatus): void {
    const badge = this.container?.querySelector('#gps-badge')
    if (!badge) return
    const dot = badge.querySelector('.gps-dot') as HTMLElement
    const label = badge.querySelector('.gps-label') as HTMLElement
    const colorMap: Record<GeoStatus, string> = {
      idle: '#888', acquiring: '#4a9eff', ok: '#34c759', error: '#ff3b30', denied: '#ff3b30'
    }
    const labelMap: Record<GeoStatus, string> = {
      idle: '', acquiring: 'Acquiring…', ok: 'GPS', error: 'No GPS', denied: 'GPS denied'
    }
    dot.style.background = colorMap[status]
    label.textContent = labelMap[status]
  }

  unmount(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.unsubscribers.forEach(fn => fn())
    this.unsubscribers = []
    // Don't stop geoService here — it stays running while app is active
  }
}
