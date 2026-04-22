/**
 * GeoXam Service Worker
 *
 * Workbox injectManifest — precache list injected by vite-plugin-pwa at build.
 *
 * Custom logic:
 *   1. /manifest.json interception → serves active disguise manifest
 *   2. Navigation fallback → index.html (SPA with hash routing)
 *
 * Messages from main thread:
 *   { type: 'SET_ACTIVE_MANIFEST', href: string }
 *   { type: 'SKIP_WAITING' }
 */

/// <reference lib="WebWorker" />
declare const self: ServiceWorkerGlobalScope

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'

// @ts-ignore __WB_MANIFEST injected at build time by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST ?? [])
cleanupOutdatedCaches()

// ─── State: which manifest to serve ──────────────────────────────────────────
const MANIFEST_CACHE = 'geoxam-manifest-v1'
let activeManifestHref = ''   // populated on activate from cache, or on first message

// ─── Messages ─────────────────────────────────────────────────────────────────
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type: string; href?: string } | null
  if (!data) return

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }

  if (data.type === 'SET_ACTIVE_MANIFEST' && data.href) {
    activeManifestHref = data.href
    caches.open(MANIFEST_CACHE).then(cache =>
      cache.put('__active__', new Response(data.href!, { headers: { 'Content-Type': 'text/plain' } }))
    )
  }
})

// ─── Restore on activate ──────────────────────────────────────────────────────
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(MANIFEST_CACHE).then(async cache => {
      const stored = await cache.match('__active__')
      if (stored) activeManifestHref = await stored.text()
    })
  )
})

// ─── Cache all manifest variants on install ───────────────────────────────────
self.addEventListener('install', (event: ExtendableEvent) => {
  // Derive base from SW location: e.g. /geoxam/sw.js → base = /geoxam/
  const swUrl = new URL(self.location.href)
  const base  = swUrl.pathname.replace(/sw\.js$/, '')

  event.waitUntil(
    caches.open('geoxam-manifests-v1').then(cache =>
      cache.addAll([
        `${base}manifest.json`,
        `${base}manifest-calculator.json`,
        `${base}manifest-calendar.json`,
        `${base}manifest-notepad.json`,
      ]).catch(() => { /* manifests not yet available on first install */ })
    )
  )
})

// ─── Intercept /manifest.json ─────────────────────────────────────────────────
registerRoute(
  ({ url }) => url.pathname.endsWith('/manifest.json') || url.pathname.endsWith('/manifest.webmanifest'),
  async ({ request }) => {
    if (!activeManifestHref) return fetch(request)

    // Build absolute target URL
    const base   = new URL(self.location.href)
    const target = new URL(activeManifestHref, base.origin)

    const cache  = await caches.open('geoxam-manifests-v1')
    const cached = await cache.match(target.href)
    if (cached) return cached

    const response = await fetch(target.href)
    if (response.ok) cache.put(target.href, response.clone())
    return response
  }
)

// ─── SPA navigation fallback → index.html ─────────────────────────────────────
// Hash routing: all navigation requests should serve index.html
// Derive path from SW location (respects base subdirectory)
const BASE_PATH = new URL(self.location.href).pathname.replace(/sw\.js$/, '')
registerRoute(
  new NavigationRoute(createHandlerBoundToURL(`${BASE_PATH}index.html`))
)
