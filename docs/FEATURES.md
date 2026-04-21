# GeoXam — Feature Specifications

> Detailed UX flows, edge cases, and behavioral specs for each feature.

---

## 1. Capture Screen

### Normal flow
1. App opens → CaptureScreen mounts
2. Camera stream starts (`facingMode: environment`)
3. GPS acquisition begins (dual-mode: fast + precise)
4. Canvas renders: video frame + crosshair (if enabled)
5. User aims → taps shutter button
6. Description dialog appears (optional, has "Skip" button)
7. After Save/Skip: composite runs → DB write → success flash
8. Viewfinder resumes immediately

### Edge cases

| Situation | Behavior |
|---|---|
| Camera permission denied | Show permission guide screen with browser-specific instructions (iOS/Android) |
| No camera hardware | Show "Camera not available" error state |
| GPS permission denied | Still allow capture; metadata: all null; warning badge shown |
| GPS fix not acquired yet | Allow capture with null coords; show "No GPS" indicator |
| GPS accuracy > 100m | Allow capture; show accuracy badge in orange (not red = still usable) |
| Storage full (estimated) | Warn before capture; show settings link to manage storage |
| Browser tab hidden during capture | Pause rAF; resume on visibility; abandon in-flight capture if needed |
| `convertToBlob` fails (OOM) | Catch error → show "Photo too large, try lower resolution" toast |

### Shutter button states
```
Normal:   Large red circle, pulsing subtle animation
Capturing: Spinner inside circle, disabled
Frozen:   Static circle (viewfinder frozen while description shown)
```

### GPS Badge
```
Acquiring:  🔵 "Acquiring…"
No fix:     🔴 "No GPS"
Inaccurate: 🟡 "±850m"
Good:       🟢 "±12m"
```

---

## 2. Gallery

### Folder list (root)
- Virtual folder "All photos" always shown first (cannot be deleted)
- User folders listed below, sorted by selected sort order
- Each folder card shows: cover thumbnail, name, photo count
- Folder card long-press → context menu (Rename, Delete)
- "+" button in header → create folder dialog (name input)

### Photo grid (folder view)
- 3-column grid, square cells
- Cell shows thumbnail + date overlay (bottom, small)
- Long-press cell → enter multi-select mode
- Multi-select: checkboxes visible on all cells, bulk action bar appears at bottom
- Bulk actions: Delete (with confirmation), Move to folder, Download

### Photo viewer
- Full-screen photo, double-tap to zoom 2×, pinch to zoom freely
- Swipe left/right to navigate within folder
- Bottom info strip (slides up on swipe):
  - Coordinates (DMS format)
  - Accuracy (if captured)
  - Altitude (if available and setting enabled)
  - Timestamp
  - Description
  - File size
- Top bar: back button, "⋮" menu (Delete, Move to folder, Share, Info)
- Share: creates temporary blob URL → `navigator.share()` if supported, else download

### Sorting options
- Date: newest first (default)
- Date: oldest first
- Size: largest first
- Size: smallest first
(Folders additionally: by name A–Z / Z–A)

### Download behavior
- Single photo: `a.download` with `URL.createObjectURL(blob)`
- Batch: download sequentially with 200ms delay between to avoid browser blocking
- Filename format: `geoxam_YYYY-MM-DD_HH-MM-SS.jpg`

### Empty states
- No folders + no photos: "Tap the camera to capture your first photo"
- Empty folder: "No photos in this folder yet"

---

## 3. Settings

### Photo Quality panel
```
Resolution:    [HD] [FHD] [4K] [Max]
                ▲ default: FHD
               
JPEG Quality:  ●───────────────○
               50%             100%
               default: 85%

Estimated size per photo: ~2.1 MB
(updates live as sliders change)

Camera:        [Front] [Back]
                       ▲ default
```

### Overlay panel
Preview box shows sample overlay in real-time.

```
[✓] Show coordinate overlay

Color: ●●●●●  [Custom]
        ^ presets: white, yellow, black, green, red

Font size: ●──────○  10px ← → 24px
Font:  [Mono] [Sans] [Serif]

Position:
  [↖ TL] [↗ TR]
  [↙ BL] [↘ BR]
           ▲ default

[✓] Show accuracy (±12m)
[ ] Show altitude
[✓] Show timestamp
[✓] Show description

──────────────────────────
Preview:
┌──────────────────────────┐
│                          │
│                          │
│ 52°21'45.2"N             │  ← live preview
│ 5°07'24.1"E ±12m         │
│ 2025-04-21 14:32:07      │
│ "Field test"             │
└──────────────────────────┘
```

### Crosshair panel
```
[✓] Show crosshair on viewfinder
    (not burned into photo)

Style: [+] [·] [○] [⌐]
        ▲ default

Color: ●●●●● [Custom]

Size:  [S] [M] [L]
           ▲ default

Opacity: ●──────○  30% ← → 100%
```

### Storage panel
```
IndexedDB Storage

████████████░░░░░░░░░░░░  38%
124 MB used of ~330 MB available

47 photos · 5 folders

[Export All Photos]
[Clear All Photos]  ← red, confirms before clearing
```

Storage estimate from `navigator.storage.estimate()`.  
"Available" = `quota - usage`.

### Masking panel
```
[✓] Enable disguise mode

Disguise as:
  [🧮 Calculator]  [📅 Calendar]  [📝 Notepad]

Access protection:
  [None]  [PIN]  [Pattern]

[Set Access Code]  ← appears if PIN or Pattern selected

[Test Unlock]  ← enters mask, then unlock flow
```

---

## 4. Mask System

### Startup logic (app.ts)
```
1. Read settings['mask.enabled']
2. If false → mount normal app (CaptureScreen)
3. If true → mount MaskUI (Calculator / Calendar / Notepad)
4. MaskUI runs independently, listens for unlock trigger
5. On trigger:
   a. If protection ≠ 'none': show PIN/Pattern lock overlay
   b. On correct code: emit 'mask:unlock'
6. On 'mask:unlock':
   a. Unmount MaskUI
   b. Mount normal app (CaptureScreen)
   c. Record unlock timestamp
7. On 'visibilitychange: hidden' + 're-show':
   a. If > 5 min since unlock → re-show mask
   b. If < 5 min → stay unlocked
```

### Calculator — functional spec
```
Layout (iOS calculator style):

  [ AC ]  [ +/- ]  [  % ]  [  ÷  ]
  [  7 ]  [   8 ]  [  9 ]  [  ×  ]
  [  4 ]  [   5 ]  [  6 ]  [  -  ]
  [  1 ]  [   2 ]  [  3 ]  [  +  ]
  [    0    ]  [  . ]  [  =  ]

Display: right-aligned, font-size auto-scales to fit
Supports: chain operations (3 + 4 × 2 = evaluates as 3 + (4×2) = 11, iOS-style)
Actually: left-to-right evaluation (iOS-style), NOT algebraic precedence

Unlock:
  Buffer tracks last 5 inputs (digits + '=')
  On each '=' press: check if buffer matches unlockSequence
  Default unlockSequence: '1337='
  If match: trigger unlock flow
  The calculator shows 1337 normally (no visual giveaway)
```

### Calendar — functional spec
```
Header: "< April 2025 >"

Grid: Sun Mon Tue Wed Thu Fri Sat
      (fills previous month days greyed)

Current day: highlighted (accent color)
Tapping any day: nothing (no action — it's a disguise)

Unlock:
  Tap the CURRENT DAY 3× within 1.5 seconds
  Counter resets if wrong day tapped or timeout expires
  If match: trigger unlock flow
```

### Notepad — functional spec
```
Layout:
  ┌─────────────────────────┐
  │ Notes                   │  ← header (title + word count)
  ├─────────────────────────┤
  │                         │
  │  [textarea full-screen] │
  │                         │
  └─────────────────────────┘

Auto-saves to settings['mask.notepadContent'] on input (debounce 500ms)
Shows word count in header: "3 words · 18 chars"

Unlock:
  Text input listener: detect if last 3 chars are ':::'
  On detection: silently remove ':::' from text
  Then: if corner tap within 2 seconds → trigger unlock flow
  Corner tap zone: 44×44px top-right corner
  Visual indicator: none (completely invisible)
```

### PIN lock overlay
```
  ┌─────────────────────────┐
  │         ● ● ● ○         │  ← 4 dots (filled = entered)
  │                         │
  │  [1] [2] [3]           │
  │  [4] [5] [6]           │
  │  [7] [8] [9]           │
  │      [0] [⌫]           │
  │                         │
  │  Wrong: 2/3 attempts    │  ← appears after first failure
  │                         │
  └─────────────────────────┘

Length: 4–8 digits (set during setup)
Display: dots (never show digits)
Wrong attempt: shake animation
After 3 wrong: "Try again in 30s" lockout timer
After lockout: timer countdown shown
No "Forgot PIN" option (by design — security)
```

### Pattern lock overlay
```
  ┌─────────────────────────┐
  │                         │
  │   ● ─ ● ─ ●            │  ← 3×3 dot grid
  │   │       │            │
  │   ●   ●   ●            │
  │           │            │
  │   ●   ●   ●            │
  │                         │
  └─────────────────────────┘

Minimum: 4 nodes connected
Lines drawn between connected nodes (visible during input)
Wrong: dots flash red
After 3 wrong: 30s lockout
```

---

## 5. PWA Install

### Android Chrome
- Browser shows "Add to Home Screen" banner automatically after 2+ visits
- App icon appears on home screen
- Opens as standalone (no browser chrome)

### iOS Safari
- No automatic banner
- App shows manual instruction on first visit: "Tap Share → Add to Home Screen"
- Instructions shown once, dismissable, remembered in settings

### Update flow
- SW detects update in background
- After 5 minutes: show toast "Update available → Tap to update"
- On tap: `skipWaiting()` → reload
- No forced updates

---

## 6. Permissions UX

### Camera permission
```
Before requesting: show explanation screen
  "GeoXam needs camera access to capture photos"
  [Allow Camera]

If denied:
  Show instructions for each browser:
  - "Open Settings → Safari → Camera → Allow"
  - "Open Chrome → Site settings → Camera → Allow"
  [Open Settings]  (links to appropriate settings page)
```

### Location permission
```
Before requesting: show explanation (minimal)
  "GeoXam needs location to tag photos with coordinates"
  [Allow Location]  [Skip – no GPS tagging]

If denied:
  App works normally, captures without GPS
  GPS badge shows "No GPS"
  Captured metadata: all null
```

Both permissions requested on first capture attempt, not on app open.
