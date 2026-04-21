# GeoXam

> **Geo-tagged photo capture app disguised as an everyday utility**

GeoXam is a mobile-first PWA that captures photos with GPS coordinates, accuracy radius, optional description, and a precision crosshair overlay — all stored strictly locally in IndexedDB. The app can masquerade as a Calculator, Calendar, or Notepad to protect its true purpose.

---

## Features

| Feature | Description |
|---|---|
| 📸 **Geo-tagged capture** | Photo + coordinates (lat/lng ±accuracy) burned into image |
| 🎯 **Crosshair overlay** | Center targeting reticle on the viewfinder |
| 🗂️ **Gallery** | Folder-based organization, sort/filter/download/delete |
| 🕵️ **Disguise mode** | Looks like Calculator / Calendar / Notepad |
| 🔐 **Access protection** | PIN or pattern lock behind the mask |
| ⚙️ **Configurable overlays** | Color, font, size, position of coordinate watermark |
| 📴 **Full offline** | PWA — works without internet |
| 🔒 **Local-only storage** | All data in IndexedDB, never leaves device |

---

## Tech Stack

```
Vite 5 + TypeScript          → Build tooling, type safety
Vanilla TS (no framework)    → Maximum performance, zero VDOM overhead
idb (3 KB)                   → Thin IndexedDB wrapper
vite-plugin-pwa + Workbox    → Service Worker, offline caching
Vitest                       → Unit testing
Playwright                   → E2E testing
```

---

## Project Status

See [docs/PLAN.md](docs/PLAN.md) for the full implementation roadmap.

```
Phase 0 → Project skeleton, CI/CD, versioning     [ ]
Phase 1 → Core: DB, Geo, Camera, Canvas           [ ]
Phase 2 → Capture screen                          [ ]
Phase 3 → Gallery                                 [ ]
Phase 4 → Settings                                [ ]
Phase 5 → Mask / disguise system                  [ ]
Phase 6 → PWA, polish, tests                      [ ]
```

---

## Versioning

Semantic versioning (`MAJOR.MINOR.PATCH`) enforced by GitHub Actions.  
Every push to `main` auto-increments the patch version and creates a git tag.  
Minor/major bumps are triggered manually via workflow dispatch.

---

## Documentation

| Doc | Purpose |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | Full implementation plan, phases, milestones |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module structure, data flow, design decisions |
| [docs/DB_SCHEMA.md](docs/DB_SCHEMA.md) | IndexedDB schema, migrations |
| [docs/FEATURES.md](docs/FEATURES.md) | Feature specs, UX flows, edge cases |
| [docs/GUIDE.md](docs/GUIDE.md) | Developer onboarding, local setup, testing |

---

## License

Private — All rights reserved
