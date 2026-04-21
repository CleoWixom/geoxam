// =============================================================================
// GeoXam — Shared Type Definitions
// =============================================================================

// -----------------------------------------------------------------------------
// Geo
// -----------------------------------------------------------------------------

export interface GeoFix {
  lat: number
  lng: number
  accuracy: number             // metres (horizontal)
  altitude: number | null      // metres above WGS84 ellipsoid
  altitudeAccuracy: number | null
  heading: number | null       // degrees clockwise from true north
  speed: number | null         // m/s
  timestamp: number            // ms since epoch (GPS fix time)
}

export type GeoStatus = 'idle' | 'acquiring' | 'ok' | 'error' | 'denied'

// -----------------------------------------------------------------------------
// Camera
// -----------------------------------------------------------------------------

export type ResolutionPreset = 'low' | 'medium' | 'high' | 'max'
export type FacingMode = 'user' | 'environment'

export interface CameraConstraints {
  facing: FacingMode
  width: number
  height: number
}

// -----------------------------------------------------------------------------
// Overlay / Watermark
// -----------------------------------------------------------------------------

export type OverlayPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type OverlayFontFamily = 'monospace' | 'sans-serif' | 'serif'

export interface OverlaySnapshot {
  enabled: boolean
  color: string              // CSS hex e.g. '#ffffff'
  fontSize: number           // px
  fontFamily: OverlayFontFamily
  position: OverlayPosition
  showAccuracy: boolean
  showAltitude: boolean
  showTimestamp: boolean
  showDescription: boolean
}

// -----------------------------------------------------------------------------
// Crosshair
// -----------------------------------------------------------------------------

export type CrosshairStyle = 'cross' | 'dot' | 'circle' | 'brackets'
export type CrosshairSize = 'small' | 'medium' | 'large'

export interface CrosshairConfig {
  enabled: boolean
  color: string
  style: CrosshairStyle
  size: CrosshairSize
  opacity: number            // 0.3 – 1.0
}

// -----------------------------------------------------------------------------
// Mask / Disguise
// -----------------------------------------------------------------------------

export type MaskType = 'calculator' | 'calendar' | 'notepad'
export type MaskProtection = 'none' | 'pin' | 'pattern'

// -----------------------------------------------------------------------------
// Settings
// -----------------------------------------------------------------------------

export interface SettingsMap {
  // Photo
  'photo.resolution': ResolutionPreset
  'photo.quality': number
  'photo.facing': FacingMode

  // Overlay
  'overlay.enabled': boolean
  'overlay.color': string
  'overlay.fontSize': number
  'overlay.fontFamily': OverlayFontFamily
  'overlay.position': OverlayPosition
  'overlay.showAccuracy': boolean
  'overlay.showAltitude': boolean
  'overlay.showTimestamp': boolean
  'overlay.showDescription': boolean

  // Crosshair
  'crosshair.enabled': boolean
  'crosshair.color': string
  'crosshair.style': CrosshairStyle
  'crosshair.size': CrosshairSize
  'crosshair.opacity': number

  // Mask
  'mask.enabled': boolean
  'mask.type': MaskType
  'mask.protection': MaskProtection
  'mask.codeHash': string
  'mask.unlockSequence': string
  'mask.notepadContent': string
}

export type SettingKey = keyof SettingsMap
export type SettingValue<K extends SettingKey> = SettingsMap[K]

// -----------------------------------------------------------------------------
// Database — Photos
// -----------------------------------------------------------------------------

export interface GeoMeta {
  lat: number | null
  lng: number | null
  accuracy: number | null
  altitude: number | null
  altitudeAccuracy: number | null
  heading: number | null
  speed: number | null
  timestamp: number            // GPS fix time (ms)
}

export interface Photo {
  id: number
  folderId: number | null
  imageBlob: Blob
  thumbnailBlob: Blob
  createdAt: number            // capture time (ms)
  size: number                 // imageBlob.size in bytes
  metadata: GeoMeta
  description: string
  overlayConfig: OverlaySnapshot
}

export type NewPhoto = Omit<Photo, 'id'>

// -----------------------------------------------------------------------------
// Database — Folders
// -----------------------------------------------------------------------------

export interface Folder {
  id: number
  name: string
  createdAt: number
  coverPhotoId: number | null
}

export type NewFolder = Omit<Folder, 'id'>

// -----------------------------------------------------------------------------
// Compositor
// -----------------------------------------------------------------------------

export interface CompositeResult {
  imageBlob: Blob
  thumbnailBlob: Blob
  size: number
}

// -----------------------------------------------------------------------------
// Storage Stats
// -----------------------------------------------------------------------------

export interface StorageStats {
  /** Bytes used by photo blobs in IndexedDB (photos store) */
  used: number
  count: number
  estimate?: {
    usage: number  // navigator.storage.estimate().usage
    quota: number  // navigator.storage.estimate().quota
  }
}

// -----------------------------------------------------------------------------
// Events (typed event catalog)
// -----------------------------------------------------------------------------

export interface AppEvents {
  'settings:changed': { key: SettingKey; value: SettingsMap[SettingKey] }
  'geo:fix': GeoFix
  'geo:error': GeolocationPositionError
  'geo:status': GeoStatus
  'photo:saved': Photo
  'photo:deleted': number        // photo id
  'folder:deleted': number       // folder id
  'mask:unlock': void
  'sw:update-ready': void
}
