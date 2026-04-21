import { drawOverlay } from './overlay.js'
import type { CompositeResult, GeoFix, OverlaySnapshot, SettingsMap } from '../../types/index.js'
import type { GeoMeta } from '../../types/index.js'

const THUMBNAIL_SIZE = 120

/**
 * Composites a captured video frame with the GPS overlay into a final JPEG blob.
 * Runs on OffscreenCanvas when available (off main thread).
 */
export async function compositePhoto(
  frame: ImageBitmap,
  geoFix: GeoFix | null,
  description: string,
  settings: SettingsMap
): Promise<CompositeResult> {
  const width = frame.width
  const height = frame.height
  const quality = settings['photo.quality']

  const overlayConfig: OverlaySnapshot = {
    enabled:          settings['overlay.enabled'],
    color:            settings['overlay.color'],
    fontSize:         settings['overlay.fontSize'],
    fontFamily:       settings['overlay.fontFamily'],
    position:         settings['overlay.position'],
    showAccuracy:     settings['overlay.showAccuracy'],
    showAltitude:     settings['overlay.showAltitude'],
    showTimestamp:    settings['overlay.showTimestamp'],
    showDescription:  settings['overlay.showDescription'],
  }

  const metadata: GeoMeta = geoFix
    ? {
        lat:              geoFix.lat,
        lng:              geoFix.lng,
        accuracy:         geoFix.accuracy,
        altitude:         geoFix.altitude,
        altitudeAccuracy: geoFix.altitudeAccuracy,
        heading:          geoFix.heading,
        speed:            geoFix.speed,
        timestamp:        geoFix.timestamp,
      }
    : {
        lat: null, lng: null, accuracy: null,
        altitude: null, altitudeAccuracy: null,
        heading: null, speed: null, timestamp: Date.now(),
      }

  const captureTime = Date.now()

  // Use OffscreenCanvas if available
  const [imageBlob, thumbnailBlob] = await Promise.all([
    renderMain(frame, width, height, metadata, description, overlayConfig, captureTime, quality),
    renderThumbnail(frame),
  ])

  return { imageBlob, thumbnailBlob, size: imageBlob.size }
}

async function renderMain(
  frame: ImageBitmap,
  width: number,
  height: number,
  metadata: GeoMeta,
  description: string,
  overlayConfig: OverlaySnapshot,
  captureTime: number,
  quality: number
): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(frame, 0, 0)
    drawOverlay(ctx, width, height, metadata, description, overlayConfig, captureTime)
    return canvas.convertToBlob({ type: 'image/jpeg', quality })
  }

  // Fallback: regular canvas
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(frame, 0, 0)
    drawOverlay(ctx, width, height, metadata, description, overlayConfig, captureTime)
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null')),
      'image/jpeg',
      quality
    )
  })
}

async function renderThumbnail(frame: ImageBitmap): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(THUMBNAIL_SIZE, THUMBNAIL_SIZE)
    const ctx = canvas.getContext('2d')!
    // Cover crop: center-crop the frame to a square
    const { sx, sy, sw, sh } = coverCrop(frame.width, frame.height, THUMBNAIL_SIZE, THUMBNAIL_SIZE)
    ctx.drawImage(frame, sx, sy, sw, sh, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE)
    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 })
  }

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = THUMBNAIL_SIZE
    canvas.height = THUMBNAIL_SIZE
    const ctx = canvas.getContext('2d')!
    const { sx, sy, sw, sh } = coverCrop(frame.width, frame.height, THUMBNAIL_SIZE, THUMBNAIL_SIZE)
    ctx.drawImage(frame, sx, sy, sw, sh, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE)
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Thumbnail toBlob returned null')),
      'image/jpeg',
      0.7
    )
  })
}

/** Calculate source crop parameters for CSS object-fit: cover equivalent */
function coverCrop(
  srcW: number, srcH: number,
  dstW: number, dstH: number
): { sx: number; sy: number; sw: number; sh: number } {
  const srcRatio = srcW / srcH
  const dstRatio = dstW / dstH

  let sw: number, sh: number
  if (srcRatio > dstRatio) {
    sh = srcH
    sw = srcH * dstRatio
  } else {
    sw = srcW
    sh = srcW / dstRatio
  }

  const sx = (srcW - sw) / 2
  const sy = (srcH - sh) / 2

  return { sx, sy, sw, sh }
}
