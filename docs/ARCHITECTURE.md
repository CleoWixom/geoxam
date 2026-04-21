# GeoXam — Architecture

> **Philosophy:** Fast by architecture, not by optimization after the fact.  
> No framework overhead. Every module has a single responsibility.  
> The DOM is mutated directly; no virtual DOM layer.

---

## 1. Module Map

```
src/
├── core/                        Pure services — zero DOM dependencies
│   ├── db/
│   │   ├── index.ts             openDB, schema, migration runner
│   │   ├── photos.ts            Photo object store operations
│   │   ├── folders.ts           Folder object store operations
│   │   └── settings.ts          Settings KV store + typed defaults
│   ├── geo/
│   │   ├── index.ts             GeoService (singleton, EventEmitter)
│   │   └── formatter.ts         Coordinate / accuracy string formatters
│   ├── camera/
│   │   ├── index.ts             CameraService (singleton)
│   │   └── capture.ts           Frame capture (ImageBitmap)
│   ├── canvas/
│   │   ├── compositor.ts        Full compositing pipeline → Blob
│   │   ├── crosshair.ts         Crosshair renderer (pure canvas 2D)
│   │   └── overlay.ts           GPS text overlay renderer
│   └── crypto/
│       └── index.ts             SHA-256 via SubtleCrypto
│
├── features/                    Screen-level UI modules
│   ├── capture/
│   │   ├── index.ts             CaptureScreen class
│   │   └── capture.css
│   ├── gallery/
│   │   ├── index.ts             GalleryRoot (folder list)
│   │   ├── folder-view.ts       FolderView (photo grid)
│   │   ├── photo-viewer.ts      PhotoViewer (fullscreen + meta)
│   │   └── gallery.css
│   ├── settings/
│   │   ├── index.ts             SettingsScreen
│   │   ├── panels/
│   │   │   ├── photo-quality.ts
│   │   │   ├── overlay.ts
│   │   │   ├── crosshair.ts
│   │   │   ├── storage.ts
│   │   │   └── mask.ts
│   │   └── settings.css
│   └── mask/
│       ├── index.ts             MaskManager (decides which mask to show)
│       ├── calculator.ts        Calculator UI
│       ├── calendar.ts          Calendar UI
│       ├── notepad.ts           Notepad UI
│       ├── pin-lock.ts          PIN entry overlay
│       ├── pattern-lock.ts      Pattern entry overlay
│       └── mask.css
│
├── ui/                          Shared primitives
│   ├── router.ts                Hash router (#/capture, #/gallery, etc.)
│   ├── events.ts                Global EventEmitter (tiny, ~30 lines)
│   ├── toast.ts                 Toast notification system
│   ├── dialog.ts                Confirm/alert dialog
│   └── transitions.ts           Screen slide/fade animations
│
├── sw/
│   └── sw.ts                    Service Worker (Workbox-generated config)
│
├── types/
│   └── index.ts                 All shared TypeScript types/interfaces
│
├── app.ts                       Bootstrap: init services, router, mask check
└── main.ts                      Vite entry: import app.ts
```

---

## 2. Data Flow

### Capture path (hot path — must be fast)

```
[User taps Capture]
        │
        ▼
CaptureScreen.onCapture()
        │
        ├── CameraService.getVideoElement()   → HTMLVideoElement
        ├── captureFrame(video)               → ImageBitmap  (~5ms)
        ├── GeoService.getLatest()            → GeoFix | null  (instant, in-memory)
        ├── settingsDB.getAllSettings()        → SettingsMap  (cached, ~0ms)
        │
        ▼
compositePhoto(frame, geo, description, settings)
        │
        ├── new OffscreenCanvas(w, h)
        ├── ctx.drawImage(frame)              (~10-30ms depending on resolution)
        ├── drawOverlay(ctx, ...)             (~2ms)
        ├── canvas.convertToBlob(...)         (~50-200ms, async)
        ├── generateThumbnail(frame)          (~5ms)
        │
        ▼
db.photos.addPhoto({
  imageBlob, thumbnailBlob,
  metadata, description,
  overlayConfig, createdAt
})                                           (~5-20ms IndexedDB write)
        │
        ▼
[Success flash → resume viewfinder]

Total user-perceived latency target: < 500ms
```

### Settings update path

```
[User changes setting in SettingsPanel]
        │
        ▼
settingsDB.setSetting(key, value)           → IndexedDB write
        │
        ▼
events.emit('settings:changed', { key, value })
        │
        ├── CaptureScreen listens → update crosshair draw params
        ├── OverlayPreview listens → re-render preview
        └── CompositorCache listens → invalidate config cache
```

### Gallery load path

```
[User navigates to #/gallery]
        │
        ▼
GalleryRoot.mount()
        │
        ├── db.folders.getAllFolders()        → Folder[]
        ├── db.photos.getPhotosByFolder(null) → count for uncategorized
        └── Render folder cards (thumbnails already embedded in Folder.coverPhotoId)
```

---

## 3. Router

Hash-based, no History API (better PWA compatibility).

```typescript
// routes
#/           → redirect to #/capture
#/capture    → CaptureScreen
#/gallery    → GalleryRoot
#/gallery/:folderId  → FolderView
#/photo/:id  → PhotoViewer
#/settings   → SettingsScreen

// router.ts API
router.navigate('#/gallery')
router.on('#/capture', CaptureScreen.mount)
router.back()                        // history.back()
```

Transitions: CSS `transform: translateX` slide in/out based on route stack depth.

---

## 4. EventEmitter

30-line implementation, no dependencies:

```typescript
class EventEmitter {
  private listeners: Map<string, Set<Function>> = new Map()
  on(event: string, fn: Function): () => void   // returns unsubscribe
  off(event: string, fn: Function): void
  emit(event: string, ...args: any[]): void
  once(event: string, fn: Function): void
}

export const events = new EventEmitter()         // global singleton
```

### Event catalog

| Event | Payload | Emitter | Listeners |
|---|---|---|---|
| `settings:changed` | `{key, value}` | settings.ts | CaptureScreen, OverlayPreview |
| `geo:fix` | `GeoFix` | GeoService | CaptureScreen GPS badge |
| `geo:error` | `PositionError` | GeoService | CaptureScreen GPS badge |
| `photo:saved` | `Photo` | CaptureScreen | GalleryRoot (badge count) |
| `photo:deleted` | `number` (id) | FolderView | GalleryRoot |
| `mask:unlock` | `void` | MaskManager | app.ts |

---

## 5. IndexedDB Schema

### Database: `geoxam_db`

```
Version 1 (initial)
│
├── Object Store: photos
│   keyPath: id (autoIncrement)
│   index: folderId
│   index: createdAt
│
├── Object Store: folders
│   keyPath: id (autoIncrement)
│   index: createdAt
│
└── Object Store: settings
    keyPath: key
```

See [DB_SCHEMA.md](DB_SCHEMA.md) for full field definitions and migration plan.

---

## 6. Settings Cache

Settings are read frequently (every frame composition, every viewfinder render of crosshair config).  
To avoid IndexedDB reads in the render loop:

```typescript
// settings.ts — in-memory cache layer
class SettingsService {
  private cache: SettingsMap | null = null

  async getAllSettings(): Promise<SettingsMap> {
    if (this.cache) return this.cache
    this.cache = await this._loadFromDB()
    return this.cache
  }

  async setSetting(key, value) {
    await this._writeToDB(key, value)
    if (this.cache) this.cache[key] = value    // update cache
    events.emit('settings:changed', { key, value })
  }
}
```

The render loop reads from the in-memory cache. DB is only hit on settings change (rare).

---

## 7. Viewfinder Render Loop

```typescript
class CaptureScreen {
  private rafId: number | null = null
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private video: HTMLVideoElement
  private crosshairConfig: CrosshairConfig   // updated via events

  private startRenderLoop(): void {
    const render = () => {
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)
      if (this.crosshairConfig.enabled) {
        drawCrosshair(this.ctx, this.canvas.width, this.canvas.height, this.crosshairConfig)
      }
      this.rafId = requestAnimationFrame(render)
    }
    this.rafId = requestAnimationFrame(render)
  }

  private stopRenderLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }
}
```

The canvas is sized to `window.innerWidth × window.innerHeight` (CSS: `object-fit: cover` equivalent via `canvas.width/height` ratio math).

---

## 8. Thumbnail Grid Virtualization

Gallery uses IntersectionObserver to avoid rendering all thumbnails at once:

```typescript
// Virtual scrolling without a library
class ThumbnailGrid {
  private observer: IntersectionObserver
  private items: Photo[]
  private rendered: Set<number> = new Set()

  private observe(el: HTMLElement, photoId: number): void {
    this.observer.observe(el)
    // On intersect: load thumbnailBlob → create ObjectURL → set img.src
    // On exit (+ margin): revoke ObjectURL, set img.src = ''
  }
}
```

Row height is fixed (CSS: 3-column grid, `vw`-based), so no layout thrashing.

---

## 9. Security Considerations

### Mask bypass resistance
- The disguise check runs in `app.ts` before any app content is mounted
- No URL hash can bypass it (router only initializes after mask clears)
- App history cleared before showing mask (back button can't peek)

### PIN storage
- PIN is stored as SHA-256 hash only
- Never stored in plaintext anywhere
- Wrong attempt counter in memory only (resets on reload)

### Data isolation
- All data in `geoxam_db` IndexedDB
- No `localStorage`, `sessionStorage`, or cookies used
- No network requests at runtime

---

## 10. Performance Budget

| Metric | Target |
|---|---|
| App first render (cold) | < 1.5s on mid-range Android |
| Capture → save | < 500ms perceived |
| Gallery open (50 photos) | < 200ms |
| Settings open | < 100ms |
| JS bundle (gzipped) | < 80 KB |
| CSS (gzipped) | < 20 KB |
| Memory (viewfinder active) | < 150 MB |
| Memory (gallery) | < 80 MB |

### Optimizations baked in at architecture level
- No framework runtime
- Thumbnail-first gallery (never loads full images into the grid)
- Object URL lifecycle management (created on demand, revoked when off-screen)
- Settings in-memory cache (no DB reads in hot paths)
- rAF loop pauses on `visibilitychange: hidden`
- OffscreenCanvas for compositing (off main thread when transferable)
- `idb` tree-shaken to used methods only

---

## 11. Build Configuration

```typescript
// vite.config.ts (outline)
export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'prompt',          // user-prompted SW update
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [],            // no runtime caching needed
      },
      manifest: { ... }
    })
  ],
  build: {
    target: 'es2020',                  // OffscreenCanvas, SubtleCrypto support
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'idb': ['idb'],              // separate vendor chunk
        }
      }
    }
  }
})
```

### Code splitting
- `idb`: separate chunk (cached across app versions if unchanged)
- Each feature (`capture`, `gallery`, `settings`, `mask`): lazy-loaded on route enter
- Core services: always in the main bundle (small, needed immediately)

---

## 12. Offline / PWA Architecture

```
Browser requests /
        │
        ▼
Service Worker intercepts
        │
        ├── Static asset (JS/CSS/HTML/icons) → CacheFirst
        │         └── Return from cache instantly
        │
        └── Navigation request → return cached index.html
```

The app never needs a network connection after install. IndexedDB provides all persistence.

**SW update flow:**
1. New SW installed in background
2. `waiting` state → SW posts message to client
3. App shows "Update available" toast
4. User taps "Update" → `skipWaiting()` → page reload
5. New assets served from updated cache
