# GeoXam — Developer Guide

---

## Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- Git
- Chrome or Firefox (for local dev)
- **Real mobile device recommended** for camera/GPS testing

---

## Local Setup

```bash
git clone https://github.com/CleoWixom/geoxam.git
cd geoxam
npm install
npm run dev
```

Vite dev server runs at `http://localhost:5173`.

> **Note:** Camera API requires HTTPS on most browsers. For local testing on a real device:
> ```bash
> npm run dev -- --host
> ```
> Then open the local network IP on your phone. Or use `ngrok` / `mkcert` for HTTPS.

---

## Project Structure Overview

```
src/core/        → Services with NO DOM dependencies (DB, Geo, Camera, Canvas, Crypto)
src/features/    → Screen-level UI: each feature is a self-contained class
src/ui/          → Shared primitives (router, events, toast, dialog)
src/types/       → All TypeScript interfaces (no implementation)
src/app.ts       → Application bootstrap
src/main.ts      → Vite entry point
tests/unit/      → Vitest tests (run in jsdom)
tests/e2e/       → Playwright tests (run in Chromium)
docs/            → All documentation
```

---

## Development Workflow

### Branching
```bash
# New feature
git checkout dev
git pull
git checkout -b feat/my-feature

# Bug fix
git checkout -b fix/issue-description
```

### PRs
- Feature branches → `dev`
- `dev` → `main` (triggers auto-version bump)
- Squash merge preferred

### Commit format
```
feat: add crosshair style selector
fix: correct GPS accuracy display on iOS
docs: update DB schema for v2
chore: bump version to 1.2.3 [skip ci]
test: add unit tests for coordinate formatter
refactor: extract overlay renderer to own module
```

---

## Running Tests

```bash
# Unit tests
npm test

# Unit tests in watch mode
npm run test:watch

# E2E tests (requires Playwright browsers)
npx playwright install chromium
npm run test:e2e

# E2E in headed mode (see browser)
npm run test:e2e -- --headed

# E2E for specific file
npm run test:e2e -- tests/e2e/capture.spec.ts
```

---

## Building for Production

```bash
npm run build
```

Output in `dist/`. Preview production build:
```bash
npm run preview
```

Production build includes:
- Minified JS + CSS (esbuild)
- Service Worker (Workbox-generated)
- PWA manifest + icons
- All assets hashed for cache-busting

---

## Adding a New Setting

1. **Add to type** in `src/types/index.ts`:
   ```typescript
   // In SettingKey and SettingValue union types
   'my.new.setting': boolean
   ```

2. **Add default** in `src/core/db/settings.ts`:
   ```typescript
   const DEFAULTS: SettingsMap = {
     ...
     'my.new.setting': false,
   }
   ```

3. **Add UI** in appropriate settings panel in `src/features/settings/panels/`

4. **Use in consumer** — read from settings cache, subscribe to `settings:changed` event

---

## Adding a New Mask Disguise

1. Create `src/features/mask/my-mask.ts`:
   ```typescript
   export class MyMask {
     mount(container: HTMLElement): void
     unmount(): void
     onUnlock(cb: () => void): void
   }
   ```

2. Register in `src/features/mask/index.ts` `MaskManager`

3. Add to `mask.type` setting union in `src/types/index.ts`

4. Add selection UI in `src/features/settings/panels/mask.ts`

---

## DB Schema Migration

To add a new field or index:

1. Increment `SCHEMA_VERSION` in `src/core/db/index.ts`
2. Add migration block:
   ```typescript
   if (oldVersion < NEW_VERSION) {
     // non-destructive change only
     const store = transaction.objectStore('photos')
     store.createIndex('by-new-field', 'newField')
   }
   ```
3. Update `DB_SCHEMA.md`
4. Test: open app in browser with old DB, verify migration runs cleanly

---

## Debugging

### IndexedDB inspection
Open DevTools → Application → IndexedDB → `geoxam_db`

### Service Worker
DevTools → Application → Service Workers  
"Update on reload" checkbox for dev mode

### GPS simulation (Chrome)
DevTools → More tools → Sensors → Location → Custom location

### Mobile remote debugging
1. Connect device via USB
2. Enable USB debugging on Android
3. Chrome: `chrome://inspect/#devices`
4. Safari on iOS: Develop menu in Mac Safari

---

## Versioning

Handled automatically by GitHub Actions. Do not manually edit the `version` field in `package.json` on `main`.

To trigger a minor or major bump:
1. Go to GitHub → Actions → "Version Bump" workflow
2. Click "Run workflow"
3. Select bump type: `minor` or `major`
4. Confirm

---

## Deployment

GitHub Actions deploys to GitHub Pages on every push to `main`.

Manual deploy:
```bash
npm run build
# Contents of dist/ → host on any static server or GitHub Pages
```

HTTPS is required for:
- Camera API (`getUserMedia`)
- Geolocation API
- Service Worker registration

GitHub Pages provides HTTPS automatically.

---

## Known Limitations

| Platform | Limitation | Notes |
|---|---|---|
| iOS Safari < 16.4 | No PWA install banner | Show manual instructions |
| iOS | GPS accuracy in browser lower than native | Expected behavior |
| Some Android | `OffscreenCanvas` not supported | Fallback to `<canvas>` |
| Firefox | `getUserMedia` constraints may differ | Test separately |
| Desktop | Not a supported target | Mobile only by design |
