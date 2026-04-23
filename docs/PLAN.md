# GeoXam — Implementation Plan

> **Version:** 1.0  
> **Status:** Planning  
> **Last updated:** 2025-04-21

---

## Table of Contents

1. [Project Summary](#1-project-summary)
2. [Constraints & Non-Negotiables](#2-constraints--non-negotiables)
3. [Tech Stack Decision](#3-tech-stack-decision)
4. [Phase Breakdown](#4-phase-breakdown)
5. [Phase 0 — Skeleton & Tooling](#phase-0--skeleton--tooling)
6. [Phase 1 — Core Services](#phase-1--core-services)
7. [Phase 2 — Capture Screen](#phase-2--capture-screen)
8. [Phase 3 — Gallery](#phase-3--gallery)
9. [Phase 4 — Settings](#phase-4--settings)
10. [Phase 5 — Mask System](#phase-5--mask-system)
11. [Phase 6 — PWA, Polish & Tests](#phase-6--pwa-polish--tests)
12. [Versioning Strategy](#12-versioning-strategy)
13. [Testing Strategy](#13-testing-strategy)
14. [Risk Register](#14-risk-register)
15. [Milestones](#15-milestones)

---

## 1. Project Summary

**GeoXam** is a pure-frontend, offline-capable Progressive Web App for mobile devices.  
Its core function is capturing photos with GPS coordinates burned directly into the image.  
It disguises itself as a mundane utility (Calculator / Calendar / Notepad) and protects access with optional PIN/pattern.

**Target platform:** Mobile browsers (Chrome for Android, Safari iOS, Firefox for Android)  
**No backend. No network calls. No analytics. No CDN dependencies at runtime.**

---

## 2. Constraints & Non-Negotiables

| # | Constraint | Impact |
|---|---|---|
| C1 | No backend, no server | All logic in-browser |
| C2 | Storage: IndexedDB only | No localStorage, no cookies, no FileSystem API |
| C3 | Mobile-only | No desktop layout work |
| C4 | Offline-capable (PWA) | Service Worker caches all assets |
| C5 | Data never leaves device | No fetch() to external endpoints at runtime |
| C6 | Performance at architecture level | No framework VDOM, lazy loading, minimal deps |
| C7 | Modular codebase | Features are independently testable and replaceable |

---

## 3. Tech Stack Decision

### Build Tool: **Vite 5**
- Fastest cold start, native ESM
- Plugin ecosystem (PWA, TypeScript)
- Tree-shaking eliminates unused code

### Language: **TypeScript (strict mode)**
- Type safety across module boundaries
- Catch DB schema mismatches at compile time

### Framework: **None (Vanilla TS)**
- React/Vue/Svelte add runtime overhead (~10-40 KB)
- Custom signal-like reactivity is sufficient for this scope
- `document.createElement` + CSS classes = full control, zero cost
- Camera + Canvas APIs are imperative anyway

### State Management: **Module-level singletons + Event Bus**
- No Redux, no Zustand
- Each core service (DB, Geo, Camera) exports a singleton
- UI subscribes via a lightweight `EventEmitter`
- Settings flow: Settings → `settings.ts` → `EventEmitter.emit('settings:changed')` → consumers update

### Styling: **CSS (PostCSS + custom properties)**
- CSS variables for theming (crosshair color, overlay color, etc.)
- No CSS-in-JS runtime
- Mobile-first (single breakpoint if any)

### IndexedDB: **idb v8** (~3 KB)
- Type-safe Promise wrapper
- No query complexity needed — simple CRUD

### PWA: **vite-plugin-pwa** + **Workbox**
- Generates SW automatically from config
- Cache strategies: CacheFirst for assets, NetworkFirst not needed

### Testing:
- **Vitest** — unit tests (fast, ESM-native)
- **Playwright** — E2E on mobile viewport (Chromium)

### Dependencies (production, runtime):
```
idb@8            ~3 KB    IndexedDB wrapper
```
Everything else is devDependency (Vite, TypeScript, Workbox).  
**Zero runtime framework dependencies.**

---

## 4. Phase Breakdown

```
Phase 0  Skeleton, tooling, CI/CD, versioning         ✅ Done
Phase 1  Core services: DB, Geo, Camera, Canvas       ✅ Done
Phase 2  Capture screen (viewfinder + capture flow)   ✅ Done
Phase 3  Gallery (folders, browser, viewer)           ✅ Done
Phase 4  Settings (all config panels)                 ✅ Done
Phase 5  Mask system (3 disguises + protection)       ✅ Done
Phase 6  PWA, polish, tests, docs                     ✅ Done
```

---

## Phase 0 — Skeleton & Tooling

### Goals
- Working Vite + TypeScript project builds and runs
- PWA manifest in place
- GitHub Actions: auto-versioning + GitHub Pages deploy
- Test runners configured
- Git branching strategy defined

### Deliverables

#### File Structure
```
geoxam/
├── .github/
│   └── workflows/
│       ├── version.yml          # Auto patch bump on push to main
│       └── deploy.yml           # Build → GitHub Pages
├── docs/                        # Documentation (this dir)
├── public/
│   ├── manifest.json
│   └── icons/                   # 72/96/128/144/152/192/384/512px PNGs
├── src/
│   ├── core/                    # Pure services, no DOM
│   ├── features/                # Screen-level UI modules
│   ├── ui/                      # Shared UI primitives
│   ├── sw/                      # Service Worker source
│   ├── types/                   # Global TypeScript types
│   ├── app.ts                   # App bootstrap (init services, router)
│   └── main.ts                  # Entry point
├── tests/
│   ├── unit/
│   └── e2e/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── playwright.config.ts
```

#### Git Branching Strategy
```
main          Production-ready. Protected. Auto-versioned on push.
dev           Integration branch. PRs merge here first.
feat/*        Feature branches (e.g., feat/capture, feat/gallery)
fix/*         Bug fixes
docs/*        Documentation-only changes
```

#### package.json scripts
```json
{
  "dev":      "vite",
  "build":    "tsc && vite build",
  "preview":  "vite preview",
  "test":     "vitest run",
  "test:e2e": "playwright test",
  "lint":     "tsc --noEmit"
}
```

---

## Phase 1 — Core Services

### Goals
All core services implemented, tested in isolation, no UI dependencies.

---

### 1.1 — DB Service (`src/core/db/`)

#### `index.ts` — DB initialization
```typescript
// Opens geoxam_db, runs migrations, exports typed DB handle
// Version 1: create stores
// Version 2+: non-destructive migrations only
export const db: IDBDatabase // via openDB('geoxam_db', SCHEMA_VERSION, upgrade)
```

#### `photos.ts`
```typescript
// CRUD for photos store
addPhoto(data: NewPhoto): Promise<number>          // returns id
getPhoto(id: number): Promise<Photo | undefined>
getPhotosByFolder(folderId: number | null): Promise<Photo[]>
deletePhoto(id: number): Promise<void>
getAllPhotos(): Promise<Photo[]>
getStorageStats(): Promise<{ used: number, count: number }>
```

#### `folders.ts`
```typescript
addFolder(name: string): Promise<number>
getFolder(id: number): Promise<Folder | undefined>
getAllFolders(): Promise<Folder[]>
deleteFolder(id: number, deletePhotos: boolean): Promise<void>
renameFolder(id: number, name: string): Promise<void>
updateFolderCover(id: number, photoId: number): Promise<void>
```

#### `settings.ts`
```typescript
// Key-value store with typed defaults
getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>>
setSetting<K extends SettingKey>(key: K, value: SettingValue<K>): Promise<void>
resetSettings(): Promise<void>
getAllSettings(): Promise<SettingsMap>
```

#### Default Settings
```typescript
const DEFAULTS: SettingsMap = {
  'photo.resolution':       'high',       // 'low'|'medium'|'high'|'max'
  'photo.quality':          0.85,         // JPEG 0.1–1.0
  'photo.facing':           'environment',
  'overlay.enabled':        true,
  'overlay.color':          '#ffffff',
  'overlay.fontSize':       14,
  'overlay.fontFamily':     'monospace',
  'overlay.position':       'bottom-left',
  'overlay.showAccuracy':   true,
  'overlay.showAltitude':   false,
  'overlay.showTimestamp':  true,
  'overlay.showDescription':true,
  'crosshair.enabled':      true,
  'crosshair.color':        '#ff3b30',
  'crosshair.style':        'cross',      // 'cross'|'dot'|'circle'|'brackets'
  'crosshair.size':         'medium',
  'crosshair.opacity':      0.85,
  'mask.enabled':           false,
  'mask.type':              'calculator',
  'mask.protection':        'none',       // 'none'|'pin'|'pattern'
  'mask.codeHash':          '',
  'mask.unlockSequence':    '',
};
```

---

### 1.2 — Geo Service (`src/core/geo/`)

#### `index.ts`
```typescript
// Singleton geolocation service
class GeoService extends EventEmitter {
  private watchId: number | null
  private latestFix: GeoFix | null
  private status: 'idle' | 'acquiring' | 'ok' | 'error'

  start(): void       // Begin watching position
  stop(): void        // clearWatch
  getLatest(): GeoFix | null
  getStatus(): GeoServiceStatus

  // Events emitted:
  // 'fix'   → GeoFix (every new position)
  // 'error' → GeolocationPositionError
}

interface GeoFix {
  lat: number
  lng: number
  accuracy: number       // meters
  altitude: number | null
  altitudeAccuracy: number | null
  heading: number | null
  speed: number | null
  timestamp: number      // ms since epoch
}
```

#### Strategy: Dual-mode acquisition
```
1. On start():
   - Fire low-accuracy request immediately (fast, ~1s)
     → emit 'fix' with rough coords, show in UI
   - Start high-accuracy watch (~3-10s)
     → replace fix when more accurate result arrives

2. On capture:
   - Use latest fix (whatever is available)
   - Flag accuracy in metadata (±accuracy)
   - If no fix: show warning, allow capture with null coords
```

#### `formatter.ts`
```typescript
// Formats coordinates for overlay rendering
formatDMS(lat: number, lng: number): string
  // → "52°21'45.2"N  5°07'24.1"E"
formatDecimal(lat: number, lng: number): string
  // → "52.362556°N  5.123361°E"
formatAccuracy(meters: number): string
  // → "±12 m" | "±0.5 km"
formatTimestamp(ms: number): string
  // → "2025-04-21  14:32:07"
```

---

### 1.3 — Camera Service (`src/core/camera/`)

#### `index.ts`
```typescript
class CameraService {
  private stream: MediaStream | null
  private videoEl: HTMLVideoElement | null

  async start(constraints: CameraConstraints): Promise<HTMLVideoElement>
  async stop(): Promise<void>
  async switchFacing(): Promise<void>    // front ↔ back
  getVideoElement(): HTMLVideoElement | null
  isActive(): boolean
}

interface CameraConstraints {
  facing: 'user' | 'environment'
  width: number
  height: number
}
```

#### Resolution presets
```typescript
const RESOLUTION_PRESETS = {
  low:    { width: 1280, height: 720  },   // HD
  medium: { width: 1920, height: 1080 },   // FHD
  high:   { width: 3840, height: 2160 },   // 4K (if device supports)
  max:    { width: 9999, height: 9999  },  // device max (ideal: max)
} as const
```

#### `capture.ts`
```typescript
// Captures a single frame from the video stream
async captureFrame(
  video: HTMLVideoElement,
  targetWidth: number,
  targetHeight: number
): Promise<ImageBitmap>
```

---

### 1.4 — Canvas Compositor (`src/core/canvas/`)

#### `compositor.ts`
```typescript
// Takes a raw frame + metadata → produces final JPEG blob + thumbnail blob
async compositePhoto(
  frame: ImageBitmap,
  geo: GeoFix | null,
  description: string,
  settings: SettingsMap
): Promise<CompositeResult>

interface CompositeResult {
  imageBlob: Blob        // JPEG at target quality
  thumbnailBlob: Blob    // 120×120 JPEG thumbnail
  size: number           // bytes
}
```

#### Pipeline inside compositor:
```
1. Create OffscreenCanvas at frame resolution
2. drawImage(frame, 0, 0)
3. If settings['overlay.enabled']:
   a. Build overlay text lines
   b. Draw semi-transparent background rect (padding around text)
   c. Render text at configured position/color/font
4. canvas.convertToBlob('image/jpeg', quality) → imageBlob
5. Create 120×120 OffscreenCanvas → drawImage scaled → thumbnailBlob
```

#### `crosshair.ts`
```typescript
// Draws crosshair on a 2D canvas context (used on the live viewfinder canvas)
drawCrosshair(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  style: CrosshairStyle,
  color: string,
  size: CrosshairSize,
  opacity: number
): void

type CrosshairStyle = 'cross' | 'dot' | 'circle' | 'brackets'
type CrosshairSize  = 'small' | 'medium' | 'large'
```

#### Crosshair specifications:

| Style | Description |
|---|---|
| `cross` | Classic `+` with gap at center |
| `dot` | Center dot only |
| `circle` | Circle with cross inside |
| `brackets` | Corner brackets (tactical look) |

---

### 1.5 — Crypto Service (`src/core/crypto/`)

```typescript
// PIN/Pattern hashing for mask protection
async hashCode(code: string): Promise<string>
  // SHA-256 via SubtleCrypto (no external deps)

async verifyCode(input: string, storedHash: string): Promise<boolean>

// Pattern encoded as sequence of grid positions 0-8 (3×3 grid)
// e.g., "0,1,2,5,8,7,6" → stored as hash
encodePattern(positions: number[]): string
```

---

## Phase 2 — Capture Screen

### Goals
Full capture UI with live viewfinder, GPS acquisition, crosshair, capture button, and post-capture flow.

### UI Layout (mobile portrait)
```
┌──────────────────────────┐
│  [GPS badge] [accuracy]  │  ← status bar (translucent overlay on top)
│                          │
│                          │
│         CANVAS           │  ← full-screen camera viewfinder
│        viewfinder        │
│          [+ ]            │  ← crosshair center
│                          │
│                          │
│   [Gallery]  [●Capture]  │  ← bottom action bar
│              [Gallery]   │
└──────────────────────────┘
```

### Capture Flow
```
User taps [● Capture]
  ├─ Freeze viewfinder (canvas still visible)
  ├─ Show description input (optional, dismissable)
  ├─ User taps [Save] or [Skip description]
  │     ├─ compositor.compositePhoto(frame, geoFix, description, settings)
  │     ├─ db.photos.addPhoto(result)
  │     ├─ Show success flash + thumbnail preview (0.8s)
  │     └─ Resume viewfinder
  └─ User taps [Cancel] → resume viewfinder
```

### GPS Status Indicator
```
🔴 red dot    → No GPS fix yet
🟡 yellow dot → Fix acquired, accuracy > 50m
🟢 green dot  → Fix acquired, accuracy ≤ 50m
           [±12m] label next to dot
```

### Performance notes
- Viewfinder is a `<canvas>` rendered via `requestAnimationFrame`
- Every frame: `ctx.drawImage(video)` + `drawCrosshair()` — no DOM manipulation
- Crosshair drawing is pure canvas: no external assets, no image decoding
- GPS updates are event-driven, not polled by the render loop
- rAF loop pauses when app is hidden (`visibilitychange`)

---

## Phase 3 — Gallery

### Goals
Browse, view, manage photos organized in folders.

### UI Structure
```
Gallery root view:
  ┌─────────────────────┐
  │ [Sort ▾] [+ Folder] │
  │                     │
  │ [📁 Folder A  (12)] │  ← tappable folder cards
  │ [📁 Folder B   (3)] │
  │ [📷 Uncategorized]  │  ← virtual folder for photos without folder
  └─────────────────────┘

Folder view:
  ┌─────────────────────┐
  │ ← Folder A  [⋮ menu]│
  │                     │
  │ [img][img][img]     │  ← thumbnail grid, 3 cols
  │ [img][img][img]     │
  │                     │
  └─────────────────────┘

Photo viewer:
  ┌─────────────────────┐
  │ ←  2025-04-21 14:32 │
  │                     │
  │    [full photo]     │  ← pinch-to-zoom
  │                     │
  │ 52.362°N 5.123°E    │  ← metadata strip
  │ ±12m · 14.3m alt    │
  │ "description text"  │
  │                     │
  │ [🗑 Delete] [⬇ Save]│
  └─────────────────────┘
```

### Sort Options
- Date (newest / oldest)
- Size (largest / smallest)
- Name (alphabetical — for folders)

### Multi-select Mode
- Long-press on thumbnail → enter multi-select
- Checkboxes appear on thumbnails
- Bulk actions: Delete, Move to folder, Download all (zip via JSZip or sequential saves)

### Download Behavior
- Single photo: `<a href="..." download>` with blob URL
- Multiple photos: Sequential individual downloads (no JSZip dependency)

### Folder Operations
- Create, rename, delete (choose: delete folder only or folder + photos)
- Move photo to folder (from viewer menu)
- Folder cover = most recent photo in folder

### Performance
- Thumbnail grid is virtualized: only render visible rows (IntersectionObserver)
- Thumbnails are read from `thumbnailBlob` (120×120), not full images
- Full image loaded only when viewer opens (lazy)
- Folder list loaded once on route enter, cached in memory

---

## Phase 4 — Settings

### Goals
Comprehensive settings UI covering all configurable aspects.

### Settings Sections

#### 📷 Photo Quality
- **Resolution**: segmented control (HD / FHD / 4K / Max)
- **JPEG quality**: slider (50% – 100%, default 85%)
- **Camera facing**: toggle (Front / Back, default Back)
- Estimated file size preview: "~2.4 MB per photo"

#### 🖊 Coordinate Overlay
- **Enable overlay**: toggle
- **Color**: color picker wheel (or presets: white, yellow, black, green)
- **Font size**: slider (10–24px)
- **Font family**: select (Monospace, Sans-serif, Serif)
- **Position**: 2×2 tap grid (top-left, top-right, bottom-left, bottom-right)
- **Show accuracy**: toggle
- **Show altitude**: toggle
- **Show timestamp**: toggle
- **Show description**: toggle
- Live preview panel showing sample overlay

#### 🎯 Crosshair
- **Enable crosshair**: toggle
- **Style**: icon selector (cross / dot / circle / brackets)
- **Color**: color picker
- **Size**: segmented control (S / M / L)
- **Opacity**: slider (30%–100%)

#### 🗄 Storage
- Storage used: "124 MB of est. ~2 GB available"
- Photo count: "47 photos in 5 folders"
- Progress bar (used / estimated available)
- [Clear all photos] button → confirmation dialog
- [Export all] → triggers downloads
- Note: `navigator.storage.estimate()` for available estimate

#### 🕵️ Masking
- **Enable mask**: toggle
- **Mask type**: card selector (Calculator / Calendar / Notepad) with preview screenshots
- **Unlock method**: segmented (Sequence / PIN / Pattern)
- **Set access code**: flow opens a setup screen
- **Test unlock**: simulate mask → enter code → returns to settings

---

## Phase 5 — Mask System

### Goals
Three fully functional disguise UIs. Each one must be convincing enough to not raise suspicion.

---

### 5.1 — Calculator Mask

Fully working arithmetic calculator (no bugs — it must be usable).

#### Unlock trigger
Enter the sequence `1337` then `=` on the calculator keypad.  
If a custom PIN is set: after sequence → PIN entry screen → unlock.  
The number `1337` is stored in settings as `mask.unlockSequence` (default).

**Security**: The expression `1337=` evaluates normally in the calculator (shows `1337`), so there's no visual giveaway. The sequence check is done silently against a buffer.

#### Implementation notes
- Classic calculator layout (iOS-style)
- Supports: `+`, `-`, `×`, `÷`, `%`, `+/-`, `AC`
- No history — single operation mode
- Input buffer tracked separately from display value
- Sequence buffer: last 5 keystrokes (digits + `=`), checked on every `=` press

---

### 5.2 — Calendar Mask

Fully functional month calendar.

#### Unlock trigger
Tap the **current day** three times within 1.5 seconds.

Custom PIN:
- After triple-tap → PIN entry overlay → unlock.

#### Implementation notes
- Shows current month on load, nav arrows for ±month
- Renders Sun–Sat grid
- Current day highlighted
- Previous/next month days shown greyed (not tappable for count)
- Tap counter resets if: wrong day tapped, or 1.5s elapsed between taps

---

### 5.3 — Notepad Mask

Basic text notepad. Text persists in a separate IndexedDB key (does not interfere with photos).

#### Unlock trigger
Type the sequence `:::` (three colons) anywhere in the text, then tap the top-right corner of the screen.

Custom PIN:
- After trigger → erase `:::` from text silently → PIN entry overlay → unlock.

#### Implementation notes
- `<textarea>` full-screen, no toolbar
- Auto-saves text as user types (debounce 500ms)
- Note count / word count in bottom status bar
- Text stored in `settings['mask.notepadContent']`

---

### 5.4 — Protection Layer

After the mask-specific trigger, the protection layer runs (if enabled):

```
protection = 'none'    → unlock immediately
protection = 'pin'     → show PIN keypad overlay
                          4–8 digit PIN
                          3 wrong attempts → 30s lockout
protection = 'pattern' → show 3×3 dot grid
                          draw pattern (min 4 nodes)
                          3 wrong attempts → 30s lockout
```

Lock state persists in memory only (cleared on page reload = extra security).

---

### 5.5 — App Switcher on Lock

When mask is enabled and app is backgrounded (`visibilitychange`):
- On return: re-show mask immediately (do not show camera/gallery)
- Exception: if unlock was within last 5 minutes → stay unlocked

---

## Phase 6 — PWA, Polish & Tests

### PWA

**manifest.json**
```json
{
  "name": "GeoXam",
  "short_name": "GeoXam",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#000000",
  "background_color": "#000000",
  "start_url": "/",
  "scope": "/",
  "icons": [ ...72, 96, 128, 144, 152, 192, 384, 512 px ]
}
```

**Service Worker strategy**
- `CacheFirst` for all static assets (JS, CSS, HTML, icons)
- No runtime network requests to cache (app is offline-only)
- SW update flow: on new SW ready → show "Update available" toast → user taps → `skipWaiting()` → reload

**iOS Safari considerations**
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- Apple splash screens (optional)
- Camera access on iOS: requires HTTPS (GitHub Pages provides this)

### Polish checklist
- [ ] Haptic feedback on capture (`navigator.vibrate(50)`)
- [ ] Volume button capture (if possible via media session API)
- [ ] Dark mode only (camera app = dark UI)
- [ ] Safe area insets (`env(safe-area-inset-*)`)
- [ ] Smooth transitions between screens (CSS slide/fade)
- [ ] Loading states for DB operations > 100ms
- [ ] Empty states (no photos, no folders)

### Accessibility (minimal — mobile-first)
- Touch targets ≥ 44×44px
- Sufficient color contrast on overlays
- `aria-label` on icon buttons

---

## 12. Versioning Strategy

### Semantic Versioning: `MAJOR.MINOR.PATCH`

| Trigger | Bump | How |
|---|---|---|
| Push to `main` | PATCH | Automatic (GitHub Actions) |
| Manual workflow dispatch | MINOR or MAJOR | Input in GitHub UI |

### Auto-versioning workflow (`.github/workflows/version.yml`)
```
Trigger: push to main (non-version-bump commits)

Steps:
1. Read current version from package.json
2. Increment PATCH
3. Update package.json
4. git commit "chore: bump version to X.Y.Z [skip ci]"
5. git tag vX.Y.Z
6. git push + push tag
```

The `[skip ci]` prevents an infinite loop.

---

## 13. Testing Strategy

### Unit Tests (Vitest)

| Module | What to test |
|---|---|
| `core/db/settings.ts` | get/set/defaults/reset |
| `core/db/photos.ts` | CRUD, storage stats |
| `core/db/folders.ts` | CRUD, delete cascade |
| `core/geo/formatter.ts` | DMS format, decimal format, accuracy format |
| `core/canvas/crosshair.ts` | Canvas pixel output (jest-canvas-mock) |
| `core/crypto/index.ts` | hash, verify, pattern encode |
| `mask/calculator` | Arithmetic correctness, unlock sequence detection |

### E2E Tests (Playwright — mobile viewport 390×844)

| Scenario | Steps |
|---|---|
| Capture flow | Grant camera+geo → open app → capture → verify photo in gallery |
| Gallery CRUD | Create folder → move photo → delete folder |
| Settings persistence | Change overlay color → capture → verify color in output |
| Mask: calculator | Enable mask → reload → unlock via sequence |
| Mask: PIN | Enable PIN → reload → fail PIN → cooldown → succeed |
| Offline mode | Load app → go offline → capture → verify stored |

### Mock strategy
- Camera: `getUserMedia` mocked with a static canvas stream
- Geolocation: `navigator.geolocation` mocked via Playwright `page.exposeBinding`
- IndexedDB: real (Playwright runs in Chromium with full browser APIs)

---

## 14. Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| iOS Safari camera permission model | High | High | Test on real device early; fallback flow |
| IndexedDB storage limits (iOS 50MB) | Medium | High | Show storage warning; guide user to manage photos |
| GPS unavailable (indoor, denied) | High | Medium | Allow capture without GPS; null coords flagged |
| OffscreenCanvas not supported (old Android) | Low | High | Detect + fallback to regular canvas |
| 4K capture exceeds memory on budget phones | Medium | Medium | Auto-downscale if OOM detected |
| PWA install blocked (iOS pre-16.4) | Medium | Low | Show manual "Add to Home Screen" instructions |

---

## 15. Milestones

| Milestone | Deliverable | Done |
|---|---|---|
| M0 | Repo + docs + CI/CD live | ✅ |
| M1 | Core services: DB + Geo + Camera + Canvas | ✅ |
| M2 | Capture screen end-to-end | ✅ |
| M3 | Gallery fully functional | ✅ |
| M4 | Settings fully functional | ✅ |
| M5 | All 3 masks + protection working | ✅ |
| M6 | PWA installable, offline works, all tests green | ✅ |
| M7 | v1.0.0 release | 🔜 — pending manual device test |

---

## Phase 6 — PWA Disguise Identity (implemented)

### Dynamic PWA Identity

When mask is enabled, the browser sees a completely different app identity:

| Mask        | `<title>`    | Manifest             | Theme color | Icons              |
|-------------|-------------|----------------------|-------------|---------------------|
| Off (real)  | GeoXam      | `/manifest.json`     | `#000000`   | Crosshair dark      |
| Calculator  | Calculator  | `/manifest-calculator.json` | `#1c1c1e` | Calculator grid |
| Calendar    | Calendar    | `/manifest-calendar.json`   | `#ff3b30` | Calendar red    |
| Notepad     | Notes       | `/manifest-notepad.json`    | `#fff8e1` | Yellow notepad  |

### How it works

```
app.ts bootstrap (step 2, before any DOM render):
  └─ applyIdentity(maskEnabled, maskType)
       ├─ <link rel="manifest"> href → correct manifest file
       ├─ document.title            → Calculator / Calendar / Notes / GeoXam  
       ├─ apple-mobile-web-app-title meta
       ├─ theme-color meta
       └─ postMessage → SW: SET_ACTIVE_MANIFEST

Service Worker (src/sw/sw.ts):
  ├─ install: caches all 4 manifest files
  ├─ message SET_ACTIVE_MANIFEST: stores active href in Cache API
  ├─ activate: restores stored href
  └─ fetch /manifest.json: serves the active manifest from cache
       → Install prompt shows disguise name + icon
```

### Icon files

Generated by Python/PIL at build time (`scripts/gen-icons.py`):

| Variant     | Style                         |
|-------------|-------------------------------|
| real        | Dark bg, red crosshair circle |
| calculator  | Dark gray, button grid        |
| calendar    | White/red header, date grid   |
| notepad     | Yellow, ruled lines, pencil   |

All sizes: 72, 96, 128, 144, 152, 192, 384, 512px PNG
