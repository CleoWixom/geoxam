import type { CrosshairConfig, CrosshairSize } from '../../types/index.js'

// =============================================================================
// Crosshair dimensions by size
// =============================================================================
const SIZE_MAP: Record<CrosshairSize, { arm: number; gap: number; dot: number; circle: number; bracket: number }> = {
  small:  { arm: 16, gap: 6,  dot: 3,  circle: 20, bracket: 14 },
  medium: { arm: 24, gap: 8,  dot: 4,  circle: 30, bracket: 20 },
  large:  { arm: 36, gap: 12, dot: 6,  circle: 44, bracket: 28 },
}

/**
 * Draw a crosshair at the center of the canvas.
 * Called every animation frame — must be fast (no allocations).
 */
export function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: CrosshairConfig
): void {
  if (!config.enabled) return

  const cx = width / 2
  const cy = height / 2
  const dim = SIZE_MAP[config.size]

  ctx.save()
  ctx.globalAlpha = config.opacity
  ctx.strokeStyle = config.color
  ctx.fillStyle = config.color
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'

  switch (config.style) {
    case 'cross':
      drawCross(ctx, cx, cy, dim.arm, dim.gap)
      break
    case 'dot':
      drawDot(ctx, cx, cy, dim.dot)
      break
    case 'circle':
      drawCircle(ctx, cx, cy, dim.circle, dim.arm, dim.gap)
      break
    case 'brackets':
      drawBrackets(ctx, cx, cy, dim.bracket)
      break
  }

  ctx.restore()
}

function drawCross(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  arm: number, gap: number
): void {
  ctx.beginPath()
  // Horizontal arms
  ctx.moveTo(cx - arm - gap, cy)
  ctx.lineTo(cx - gap, cy)
  ctx.moveTo(cx + gap, cy)
  ctx.lineTo(cx + arm + gap, cy)
  // Vertical arms
  ctx.moveTo(cx, cy - arm - gap)
  ctx.lineTo(cx, cy - gap)
  ctx.moveTo(cx, cy + gap)
  ctx.lineTo(cx, cy + arm + gap)
  ctx.stroke()
}

function drawDot(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
}

function drawCircle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  r: number, arm: number, gap: number
): void {
  // Circle
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  // Center cross
  drawCross(ctx, cx, cy, arm * 0.5, gap * 0.7)
}

function drawBrackets(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  size: number
): void {
  const half = size / 2
  const arm = size * 0.4

  ctx.beginPath()
  // Top-left
  ctx.moveTo(cx - half + arm, cy - half)
  ctx.lineTo(cx - half, cy - half)
  ctx.lineTo(cx - half, cy - half + arm)
  // Top-right
  ctx.moveTo(cx + half - arm, cy - half)
  ctx.lineTo(cx + half, cy - half)
  ctx.lineTo(cx + half, cy - half + arm)
  // Bottom-left
  ctx.moveTo(cx - half, cy + half - arm)
  ctx.lineTo(cx - half, cy + half)
  ctx.lineTo(cx - half + arm, cy + half)
  // Bottom-right
  ctx.moveTo(cx + half, cy + half - arm)
  ctx.lineTo(cx + half, cy + half)
  ctx.lineTo(cx + half - arm, cy + half)
  ctx.stroke()
}
