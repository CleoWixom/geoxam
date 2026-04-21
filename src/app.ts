/**
 * GeoXam — Application Bootstrap
 *
 * Order of operations (strict):
 * 1. Read mask settings from IndexedDB (fast, single TX)
 * 2. applyIdentity() — swap manifest link, title, apple meta, theme-color
 *    This must happen BEFORE any rendering so the browser sees the correct
 *    PWA identity if it shows an install prompt during this session.
 * 3a. mask.enabled → mount MaskManager (disguise UI)
 * 3b. else         → mount normal app shell + router
 * 4. Register Service Worker (non-blocking)
 */

import { getDB } from './core/db/index.js'
import { settingsDB } from './core/db/settings.js'
import { applyIdentity } from './core/manifest.js'
import { events } from './ui/events.js'
import { router } from './ui/router.js'
import { toast } from './ui/toast.js'
import type { MaskType } from './types/index.js'

const loadCapture  = () => import('./features/capture/index.js')
const loadGallery  = () => import('./features/gallery/index.js')
const loadSettings = () => import('./features/settings/index.js')
const loadMask     = () => import('./features/mask/index.js')

async function bootstrap(): Promise<void> {
  // 1. Warm DB connection
  await getDB()

  // 2. Read mask settings + apply PWA identity atomically
  const [maskEnabled, maskType] = await Promise.all([
    settingsDB.getSetting('mask.enabled'),
    settingsDB.getSetting('mask.type'),
  ])

  applyIdentity(maskEnabled, maskType as MaskType)

  // 3. Mount appropriate UI
  if (maskEnabled) {
    const { MaskManager } = await loadMask()
    const mask = new MaskManager()
    mask.mount(document.getElementById('app')!)

    events.once('mask:unlock', () => {
      mask.unmount()
      startApp()
    })
  } else {
    startApp()
  }

  // 4. Service Worker (non-blocking)
  registerSW()
}

function startApp(): void {
  const appEl = document.getElementById('app')!

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

  document.getElementById('bottom-nav')!.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLElement>('[data-route]')
    if (btn) router.navigate(btn.dataset.route!)
  })

  const screenEl = document.getElementById('screen-container')!

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
  setupAutoLock()
}

// ---------------------------------------------------------------------------
// Screen mounting
// ---------------------------------------------------------------------------
interface Screen { mount(el: HTMLElement): void; unmount?(): void }
let currentScreen: Screen | null = null

function mountScreen(container: HTMLElement, screen: Screen): void {
  currentScreen?.unmount?.()
  container.innerHTML = ''
  currentScreen = screen
  screen.mount(container)
}

function setActiveNav(route: string): void {
  document.querySelectorAll<HTMLElement>('#bottom-nav button').forEach(btn => {
    btn.classList.toggle('active', (btn.dataset.route ?? '').includes(route))
  })
}

// ---------------------------------------------------------------------------
// Auto-lock (re-show mask after 5 min in background)
// ---------------------------------------------------------------------------
let lastUnlockTime = 0
const LOCK_TIMEOUT = 5 * 60 * 1000

function setupAutoLock(): void {
  events.on('mask:unlock', () => { lastUnlockTime = Date.now() })

  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return
    const maskEnabled = await settingsDB.getSetting('mask.enabled')
    if (!maskEnabled) return
    if (Date.now() - lastUnlockTime > LOCK_TIMEOUT) {
      window.location.reload()
    }
  })
}

// ---------------------------------------------------------------------------
// Service Worker registration
// ---------------------------------------------------------------------------
function registerSW(): void {
  if (!('serviceWorker' in navigator)) return

  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      onNeedRefresh() {
        toast('Update available', 'info', {
          duration: 0,
          action: {
            label: 'Update now',
            onClick: () => {
              // Tell SW to skip waiting, then reload
              navigator.serviceWorker.ready.then(reg => {
                reg.active?.postMessage({ type: 'SKIP_WAITING' })
              })
              window.location.reload()
            },
          },
        })
      },
    })
  }).catch(() => { /* dev mode — no SW */ })
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
bootstrap().catch(err => {
  console.error('[GeoXam] Bootstrap failed:', err)
  document.body.innerHTML = `
    <div style="padding:32px;color:#ff3b30;font-family:monospace;font-size:14px;">
      <p>Failed to start GeoXam.</p>
      <p style="color:#888;margin-top:8px;">${err?.message ?? err}</p>
      <button onclick="location.reload()" style="margin-top:16px;padding:10px 20px;background:#ff3b30;color:#fff;border:none;border-radius:8px;font-size:14px;">
        Reload
      </button>
    </div>
  `
})
