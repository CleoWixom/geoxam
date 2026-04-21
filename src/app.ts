/**
 * GeoXam — Application Bootstrap
 *
 * Order of operations:
 * 1. Init IndexedDB connection (eagerly, so it's ready before first interaction)
 * 2. Check mask.enabled setting
 * 3a. If mask on  → mount MaskManager (shows disguise UI)
 * 3b. If mask off → mount normal app shell + init router
 * 4. Register Service Worker (non-blocking)
 */

import { getDB } from './core/db/index.js'
import { settingsDB } from './core/db/settings.js'
import { events } from './ui/events.js'
import { router } from './ui/router.ts'
import { toast } from './ui/toast.js'

// Feature modules — lazy loaded on route enter
const loadCapture  = () => import('./features/capture/index.js')
const loadGallery  = () => import('./features/gallery/index.js')
const loadSettings = () => import('./features/settings/index.js')
const loadMask     = () => import('./features/mask/index.js')

async function bootstrap(): Promise<void> {
  // 1. Warm up DB connection
  await getDB()

  // 2. Check mask
  const maskEnabled = await settingsDB.getSetting('mask.enabled')

  if (maskEnabled) {
    // 3a. Show mask — defer all other loading
    const { MaskManager } = await loadMask()
    const mask = new MaskManager()
    mask.mount(document.getElementById('app')!)

    // On unlock: unmount mask, start normal app
    events.once('mask:unlock', () => {
      mask.unmount()
      startApp()
    })
  } else {
    // 3b. Start normal app immediately
    startApp()
  }

  // 4. Register SW (non-blocking)
  registerSW()
}

function startApp(): void {
  const appEl = document.getElementById('app')!

  // Create main layout
  appEl.innerHTML = `
    <div id="screen-container"></div>
    <nav id="bottom-nav">
      <button data-route="#/capture" aria-label="Camera">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="13" r="4"/>
          <path d="M5 7h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/>
        </svg>
        <span>Camera</span>
      </button>
      <button data-route="#/gallery" aria-label="Gallery">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
        </svg>
        <span>Gallery</span>
      </button>
      <button data-route="#/settings" aria-label="Settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
        </svg>
        <span>Settings</span>
      </button>
    </nav>
  `

  // Wire bottom nav
  const nav = document.getElementById('bottom-nav')!
  nav.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest('[data-route]') as HTMLElement | null
    if (btn) router.navigate(btn.dataset.route!)
  })

  const screenEl = document.getElementById('screen-container')!

  // Register routes
  router.on('/capture', async () => {
    setActiveNav('capture')
    const { CaptureScreen } = await loadCapture()
    mountScreen(screenEl, new CaptureScreen())
  })

  router.on('/gallery', async () => {
    setActiveNav('gallery')
    const { GalleryRoot } = await loadGallery()
    mountScreen(screenEl, new GalleryRoot())
  })

  router.on('/gallery/:folderId', async ({ folderId }) => {
    setActiveNav('gallery')
    const { FolderView } = await loadGallery()
    mountScreen(screenEl, new FolderView(folderId))
  })

  router.on('/photo/:id', async ({ id }) => {
    const { PhotoViewer } = await loadGallery()
    mountScreen(screenEl, new PhotoViewer(Number(id)))
  })

  router.on('/settings', async () => {
    setActiveNav('settings')
    const { SettingsScreen } = await loadSettings()
    mountScreen(screenEl, new SettingsScreen())
  })

  router.start()

  // Handle mask re-lock on background
  setupAutoLock()
}

interface Screen {
  mount(el: HTMLElement): void
  unmount?(): void
}

let currentScreen: Screen | null = null

function mountScreen(container: HTMLElement, screen: Screen): void {
  currentScreen?.unmount?.()
  container.innerHTML = ''
  currentScreen = screen
  screen.mount(container)
}

function setActiveNav(route: string): void {
  document.querySelectorAll('#bottom-nav button').forEach(btn => {
    const el = btn as HTMLElement
    el.classList.toggle('active', el.dataset.route?.includes(route) ?? false)
  })
}

let lastUnlockTime = 0

function setupAutoLock(): void {
  events.on('mask:unlock', () => { lastUnlockTime = Date.now() })

  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return

    const maskEnabled = await settingsDB.getSetting('mask.enabled')
    if (!maskEnabled) return

    const elapsed = Date.now() - lastUnlockTime
    const LOCK_TIMEOUT_MS = 5 * 60 * 1000   // 5 minutes

    if (elapsed > LOCK_TIMEOUT_MS) {
      window.location.reload()   // Cleanest way: reload triggers mask on next bootstrap
    }
  })
}

function registerSW(): void {
  if ('serviceWorker' in navigator) {
    import('virtual:pwa-register').then(({ registerSW }) => {
      registerSW({
        onNeedRefresh() {
          toast('Update available', 'info', {
            duration: 0,
            action: {
              label: 'Update',
              onClick: () => window.location.reload(),
            },
          })
        },
      })
    }).catch(() => {
      // SW registration not critical — ignore in dev mode
    })
  }
}

// Bootstrap
bootstrap().catch(err => {
  console.error('[GeoXam] Bootstrap failed:', err)
  document.body.innerHTML = '<p style="color:red;padding:20px;">Failed to initialize app. Please reload.</p>'
})
