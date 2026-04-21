import type { OverlayPosition, OverlayFontFamily } from '../../types/index.js'
import { buildOverlayLines } from '../geo/formatter.js'
import type { GeoMeta, OverlaySnapshot } from '../../types/index.js'

const PADDING = 10
const LINE_SPACING = 4
const BG_ALPHA = 0.55

/**
 * Draw the GPS coordinate overlay onto a canvas context.
 * Called once per capture on the offscreen canvas (not the live viewfinder).
 */
export function drawOverlay(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  metadata: GeoMeta,
  description: string,
  config: OverlaySnapshot,
  captureTime: number
): void {
  if (!config.enabled) return

  const lines = buildOverlayLines(
    metadata.lat,
    metadata.lng,
    metadata.accuracy,
    metadata.altitude,
    metadata.altitudeAccuracy,
    captureTime,
    description,
    {
      showAccuracy:     config.showAccuracy,
      showAltitude:     config.showAltitude,
      showTimestamp:    config.showTimestamp,
      showDescription:  config.showDescription,
    }
  )

  if (lines.length === 0) return

  ctx.save()

  const fontSize = config.fontSize
  const font = resolveFont(fontSize, config.fontFamily)
  ctx.font = font
  ctx.textBaseline = 'top'

  // Measure widest line
  const lineHeights = fontSize + LINE_SPACING
  const textWidth = Math.max(...lines.map(l => ctx.measureText(l).width))
  const blockHeight = lines.length * lineHeights - LINE_SPACING

  const { x, y } = resolvePosition(
    config.position,
    canvasWidth,
    canvasHeight,
    textWidth,
    blockHeight
  )

  // Background
  ctx.globalAlpha = BG_ALPHA
  ctx.fillStyle = '#000000'
  ctx.fillRect(
    x - PADDING,
    y - PADDING,
    textWidth + PADDING * 2,
    blockHeight + PADDING * 2
  )

  // Text
  ctx.globalAlpha = 1
  ctx.fillStyle = config.color
  lines.forEach((line, i) => {
    ctx.fillText(line, x, y + i * lineHeights)
  })

  ctx.restore()
}

function resolvePosition(
  position: OverlayPosition,
  cw: number, ch: number,
  tw: number, th: number
): { x: number; y: number } {
  const margin = 16
  switch (position) {
    case 'top-left':     return { x: margin, y: margin }
    case 'top-right':    return { x: cw - tw - margin, y: margin }
    case 'bottom-left':  return { x: margin, y: ch - th - margin }
    case 'bottom-right': return { x: cw - tw - margin, y: ch - th - margin }
  }
}

function resolveFont(size: number, family: OverlayFontFamily): string {
  const families: Record<OverlayFontFamily, string> = {
    'monospace':  `${size}px 'Courier New', Courier, monospace`,
    'sans-serif': `${size}px -apple-system, Arial, sans-serif`,
    'serif':      `${size}px Georgia, 'Times New Roman', serif`,
  }
  return families[family]
}
