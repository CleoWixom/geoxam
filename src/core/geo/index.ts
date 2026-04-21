import { events } from '../../ui/events.js'
import type { GeoFix, GeoStatus } from '../../types/index.js'

// =============================================================================
// GeoService — Dual-mode geolocation (fast fix + high accuracy watch)
// =============================================================================

class GeoService {
  private watchId: number | null = null
  private latestFix: GeoFix | null = null
  private status: GeoStatus = 'idle'

  /** Start GPS acquisition. Safe to call multiple times. */
  start(): void {
    if (this.watchId !== null) return   // already running

    if (!('geolocation' in navigator)) {
      this.setStatus('error')
      return
    }

    this.setStatus('acquiring')

    // Pass 1: quick coarse fix (fast, ~1s)
    navigator.geolocation.getCurrentPosition(
      (pos) => this.onPosition(pos),
      (err) => this.onError(err),
      { enableHighAccuracy: false, timeout: 5_000, maximumAge: 10_000 }
    )

    // Pass 2: precise continuous watch
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onPosition(pos),
      (err) => this.onError(err),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }
    )
  }

  /** Stop watching. */
  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId)
      this.watchId = null
    }
    this.setStatus('idle')
  }

  getLatest(): GeoFix | null {
    return this.latestFix
  }

  getStatus(): GeoStatus {
    return this.status
  }

  private onPosition(pos: GeolocationPosition): void {
    const fix: GeoFix = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude,
      altitudeAccuracy: pos.coords.altitudeAccuracy,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
      timestamp: pos.timestamp,
    }

    // Only update if this fix is more accurate than the previous one,
    // or if we have no fix yet
    const better =
      this.latestFix === null ||
      fix.accuracy < this.latestFix.accuracy

    if (better) {
      this.latestFix = fix
      this.setStatus('ok')
      events.emit('geo:fix', fix)
    }
  }

  private onError(err: GeolocationPositionError): void {
    const isDenied = err.code === GeolocationPositionError.PERMISSION_DENIED
    this.setStatus(isDenied ? 'denied' : 'error')
    events.emit('geo:error', err)
  }

  private setStatus(s: GeoStatus): void {
    if (this.status !== s) {
      this.status = s
      events.emit('geo:status', s)
    }
  }
}

/** Singleton geo service — import anywhere */
export const geoService = new GeoService()
