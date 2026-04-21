/**
 * GeoXam Service Worker
 *
 * Extends Workbox (injected by vite-plugin-pwa) with:
 *   1. /manifest.json interception — serves the active disguise manifest
 *   2. Offline fallback for navigation requests
 *
 * Message protocol from main thread:
 *   { type: 'SET_ACTIVE_MANIFEST', href: '/manifest-calculator.json' }
 *   { type: 'SKIP_WAITING' }
 */

/// <reference lib="WebWorker" />
declare const self: ServiceWorkerGlobalScope

// Workbox injects its precache manifest here at build time
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'

// ─── Precache all static assets (injected by vite-plugin-pwa) ────────────────
// @ts-expect-error __WB_MANIFEST injected at build time
precacheAndRoute(self.__WB_MANIFEST ?? [])
cleanupOutdatedCaches()

// ─── Active manifest state ────────────────────────────────────────────────────
const MANIFEST_CACHE = 'geoxam-manifest-v1'
let activeManifestHref = '/manifest.json'   // default = real app

// ─── Message handler ──────────────────────────────────────────────────────────
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type: string; href?: string }

  if (data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }

  if (data?.type === 'SET_ACTIVE_MANIFEST' && data.href) {
    activeManifestHref = data.href
    // Persist to cache so next SW activation remembers the choice
    caches.open(MANIFEST_CACHE).then(cache => {
      cache.put('__active_manifest__', new Response(data.href!, {
        headers: { 'Content-Type': 'text/plain' }
      }))
    })
  }
})

// ─── Restore active manifest on SW activation ─────────────────────────────────
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(MANIFEST_CACHE).then(async cache => {
      const stored = await cache.match('__active_manifest__')
      if (stored) activeManifestHref = await stored.text()
    })
  )
})

// ─── Intercept /manifest.json ─────────────────────────────────────────────────
registerRoute(
  ({ url }) => url.pathname === '/manifest.json',
  async ({ request }) => {
    // Serve the active manifest file (real or disguise)
    const targetUrl = request.url.replace('/manifest.json', activeManifestHref)

    // Try cache first (CacheFirst for manifests — they're versioned via filename)
    const cache = await caches.open('geoxam-manifests-v1')
    const cached = await cache.match(targetUrl)
    if (cached) return cached

    // Fetch and cache
    const response = await fetch(targetUrl)
    if (response.ok) cache.put(targetUrl, response.clone())
    return response
  }
)

// ─── Cache all manifest variants upfront ─────────────────────────────────────
self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open('geoxam-manifests-v1').then(cache =>
      cache.addAll([
        '/manifest.json',
        '/manifest-calculator.json',
        '/manifest-calendar.json',
        '/manifest-notepad.json',
      ])
    )
  )
})

// ─── Navigation fallback (SPA) ────────────────────────────────────────────────
registerRoute(
  new NavigationRoute(
    new CacheFirst({ cacheName: 'geoxam-navigation' }),
    { denylist: [/\/api\//] }
  )
)
