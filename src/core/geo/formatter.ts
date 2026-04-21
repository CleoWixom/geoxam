// =============================================================================
// Coordinate Formatters
// =============================================================================

/**
 * Decimal Degrees to Degrees/Minutes/Seconds string
 * Example: 52.362556 → 52°21'45.2"N
 */
export function toDMS(deg: number, isLat: boolean): string {
  const abs = Math.abs(deg)
  const d = Math.floor(abs)
  const mFull = (abs - d) * 60
  const m = Math.floor(mFull)
  const s = ((mFull - m) * 60).toFixed(1)

  const dir = isLat
    ? deg >= 0 ? 'N' : 'S'
    : deg >= 0 ? 'E' : 'W'

  return `${d}°${m}'${s}"${dir}`
}

/**
 * Format lat/lng pair as DMS string
 * Example: "52°21'45.2"N  5°07'24.1"E"
 */
export function formatDMS(lat: number, lng: number): string {
  return `${toDMS(lat, true)}  ${toDMS(lng, false)}`
}

/**
 * Format lat/lng as decimal degrees
 * Example: "52.362556°N  5.123361°E"
 */
export function formatDecimal(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S'
  const lngDir = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(6)}°${latDir}  ${Math.abs(lng).toFixed(6)}°${lngDir}`
}

/**
 * Format accuracy in metres, switching to km above 1000m
 * Example: 12 → "±12 m"   850 → "±850 m"   1500 → "±1.5 km"
 */
export function formatAccuracy(metres: number): string {
  if (metres >= 1000) {
    return `±${(metres / 1000).toFixed(1)} km`
  }
  return `±${Math.round(metres)} m`
}

/**
 * Format altitude in metres with accuracy if available
 * Example: "14.3 m ±3 m"
 */
export function formatAltitude(altitude: number, altAccuracy: number | null): string {
  const base = `${altitude.toFixed(1)} m`
  if (altAccuracy !== null) return `${base} ±${Math.round(altAccuracy)} m`
  return base
}

/**
 * Format a timestamp as local date+time string
 * Example: "2025-04-21  14:32:07"
 */
export function formatTimestamp(ms: number): string {
  const d = new Date(ms)
  const date = d.toLocaleDateString('en-CA') // YYYY-MM-DD
  const time = d.toTimeString().slice(0, 8)   // HH:MM:SS
  return `${date}  ${time}`
}

/**
 * Build full overlay text lines from metadata + settings flags
 */
export function buildOverlayLines(
  lat: number | null,
  lng: number | null,
  accuracy: number | null,
  altitude: number | null,
  altitudeAccuracy: number | null,
  timestamp: number,
  description: string,
  opts: {
    showAccuracy: boolean
    showAltitude: boolean
    showTimestamp: boolean
    showDescription: boolean
  }
): string[] {
  const lines: string[] = []

  if (lat !== null && lng !== null) {
    const coordLine = formatDMS(lat, lng)
    const accPart = (opts.showAccuracy && accuracy !== null) ? `  ${formatAccuracy(accuracy)}` : ''
    lines.push(coordLine + accPart)
  } else {
    lines.push('No GPS fix')
  }

  if (opts.showAltitude && altitude !== null) {
    lines.push(formatAltitude(altitude, altitudeAccuracy))
  }

  if (opts.showTimestamp) {
    lines.push(formatTimestamp(timestamp))
  }

  if (opts.showDescription && description.trim()) {
    lines.push(description.trim())
  }

  return lines
}
