# GeoXam — IndexedDB Schema

> **Database name:** `geoxam_db`  
> **Current schema version:** `1`

---

## Object Stores

### 1. `photos`

Primary storage for captured images.

| Field | Type | Description |
|---|---|---|
| `id` | `number` | Auto-increment primary key |
| `folderId` | `number \| null` | Reference to `folders.id`. `null` = uncategorized |
| `imageBlob` | `Blob` | Full-resolution JPEG |
| `thumbnailBlob` | `Blob` | 120×120 JPEG thumbnail |
| `createdAt` | `number` | Unix timestamp (ms) |
| `size` | `number` | `imageBlob.size` in bytes |
| `metadata` | `GeoMeta` | GPS fix at time of capture |
| `description` | `string` | Optional user description ("") |
| `overlayConfig` | `OverlaySnapshot` | Copy of overlay settings at capture time |

#### `GeoMeta` type
```typescript
interface GeoMeta {
  lat:              number | null
  lng:              number | null
  accuracy:         number | null   // meters
  altitude:         number | null   // meters above WGS84
  altitudeAccuracy: number | null   // meters
  heading:          number | null   // degrees from true north
  speed:            number | null   // m/s
  timestamp:        number          // GPS fix timestamp (ms)
}
```

#### `OverlaySnapshot` type
```typescript
interface OverlaySnapshot {
  enabled:          boolean
  color:            string    // CSS color hex
  fontSize:         number    // px
  fontFamily:       string
  position:         OverlayPosition
  showAccuracy:     boolean
  showAltitude:     boolean
  showTimestamp:    boolean
  showDescription:  boolean
}
type OverlayPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
```

#### Indexes
| Index name | Field | Unique | Purpose |
|---|---|---|---|
| `by-folder` | `folderId` | No | Query photos by folder |
| `by-date` | `createdAt` | No | Sort by date |

---

### 2. `folders`

Organizational containers for photos.

| Field | Type | Description |
|---|---|---|
| `id` | `number` | Auto-increment primary key |
| `name` | `string` | Folder display name |
| `createdAt` | `number` | Unix timestamp (ms) |
| `coverPhotoId` | `number \| null` | `photos.id` to use as cover thumbnail |

#### Indexes
| Index name | Field | Unique | Purpose |
|---|---|---|---|
| `by-date` | `createdAt` | No | Sort folders by creation date |

---

### 3. `settings`

Key-value store for all application configuration.

| Field | Type | Description |
|---|---|---|
| `key` | `string` | Setting key (primary key, not auto-increment) |
| `value` | `SettingValue` | Typed value (see defaults below) |

#### All setting keys with types and defaults

```typescript
// Photo capture
'photo.resolution'        : 'low' | 'medium' | 'high' | 'max'   = 'high'
'photo.quality'           : number  (0.1–1.0)                    = 0.85
'photo.facing'            : 'user' | 'environment'               = 'environment'

// GPS coordinate overlay (burned into image)
'overlay.enabled'         : boolean                              = true
'overlay.color'           : string  (CSS hex)                    = '#ffffff'
'overlay.fontSize'        : number  (px, 10–24)                  = 14
'overlay.fontFamily'      : 'monospace' | 'sans-serif' | 'serif' = 'monospace'
'overlay.position'        : OverlayPosition                      = 'bottom-left'
'overlay.showAccuracy'    : boolean                              = true
'overlay.showAltitude'    : boolean                              = false
'overlay.showTimestamp'   : boolean                              = true
'overlay.showDescription' : boolean                              = true

// Crosshair (live viewfinder only, NOT burned into image)
'crosshair.enabled'       : boolean                              = true
'crosshair.color'         : string  (CSS hex)                    = '#ff3b30'
'crosshair.style'         : 'cross' | 'dot' | 'circle' | 'brackets' = 'cross'
'crosshair.size'          : 'small' | 'medium' | 'large'         = 'medium'
'crosshair.opacity'       : number  (0.3–1.0)                    = 0.85

// Mask / disguise
'mask.enabled'            : boolean                              = false
'mask.type'               : 'calculator' | 'calendar' | 'notepad' = 'calculator'
'mask.protection'         : 'none' | 'pin' | 'pattern'           = 'none'
'mask.codeHash'           : string  (SHA-256 hex, "" if none)    = ''
'mask.unlockSequence'     : string  (default calculator sequence) = '1337='
'mask.notepadContent'     : string  (notepad text)               = ''
```

---

## TypeScript Interfaces

```typescript
// types/index.ts

export interface Photo {
  id:             number
  folderId:       number | null
  imageBlob:      Blob
  thumbnailBlob:  Blob
  createdAt:      number
  size:           number
  metadata:       GeoMeta
  description:    string
  overlayConfig:  OverlaySnapshot
}

export type NewPhoto = Omit<Photo, 'id'>

export interface Folder {
  id:           number
  name:         string
  createdAt:    number
  coverPhotoId: number | null
}

export interface GeoMeta {
  lat:              number | null
  lng:              number | null
  accuracy:         number | null
  altitude:         number | null
  altitudeAccuracy: number | null
  heading:          number | null
  speed:            number | null
  timestamp:        number
}

export interface OverlaySnapshot {
  enabled:          boolean
  color:            string
  fontSize:         number
  fontFamily:       string
  position:         OverlayPosition
  showAccuracy:     boolean
  showAltitude:     boolean
  showTimestamp:    boolean
  showDescription:  boolean
}

export type OverlayPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface GeoFix {
  lat:              number
  lng:              number
  accuracy:         number
  altitude:         number | null
  altitudeAccuracy: number | null
  heading:          number | null
  speed:            number | null
  timestamp:        number
}

export interface CompositeResult {
  imageBlob:      Blob
  thumbnailBlob:  Blob
  size:           number
}

export interface StorageStats {
  used:   number    // bytes used by photos in IndexedDB
  count:  number    // total photo count
  estimate?: {
    usage: number   // navigator.storage.estimate().usage
    quota: number   // navigator.storage.estimate().quota
  }
}
```

---

## Migration Plan

Schema migrations run in the `upgrade` callback of `openDB`.

```typescript
openDB('geoxam_db', CURRENT_VERSION, {
  upgrade(db, oldVersion, newVersion, transaction) {
    // Version 0 → 1 (initial creation)
    if (oldVersion < 1) {
      const photos = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true })
      photos.createIndex('by-folder', 'folderId')
      photos.createIndex('by-date', 'createdAt')

      const folders = db.createObjectStore('folders', { keyPath: 'id', autoIncrement: true })
      folders.createIndex('by-date', 'createdAt')

      db.createObjectStore('settings', { keyPath: 'key' })
    }

    // Version 1 → 2 (future example)
    // if (oldVersion < 2) {
    //   const photos = transaction.objectStore('photos')
    //   photos.createIndex('by-size', 'size')
    // }
  }
})
```

### Migration rules
- **Never drop** an object store in a migration (data loss)
- **Never rename** an index (drop + recreate if needed)
- Non-destructive additions only
- If breaking change needed: increment version, write data-migration cursor

---

## Estimated Storage Usage

| Per photo (FHD, quality 0.85) | ~1.5 – 2.5 MB |
| Per thumbnail (120×120) | ~5–15 KB |
| Folders + settings overhead | Negligible |

**Practical limits:**
- iOS Safari: 50% of available disk space (usually 2–10 GB)
- Android Chrome: dynamic quota, typically 60%+ of free space
- App shows `navigator.storage.estimate()` in Settings → Storage

**Warning threshold:** Warn user when `usage / quota > 80%`
