/**
 * ManifestManager
 *
 * Applies PWA identity disguise BEFORE any UI mounts.
 * Swaps: <link rel="manifest">, <title>, apple meta tags, theme-color.
 *
 * Service Worker intercepts GET /manifest.json → reads cached identity →
 * returns the active manifest. This ensures the install prompt (A2HS) always
 * shows the correct name and icon, even while the app is already installed.
 */

import type { MaskType } from '../types/index.js'

export interface ManifestIdentity {
  /** href of the manifest file to activate */
  manifestHref: string
  /** Browser tab / window title */
  title: string
  /** Short name for apple-mobile-web-app-title */
  appleTitle: string
  /** theme-color meta */
  themeColor: string
}

const IDENTITIES: Record<'real' | MaskType, ManifestIdentity> = {
  real: {
    manifestHref: '/manifest.json',
    title:        'GeoXam',
    appleTitle:   'GeoXam',
    themeColor:   '#000000',
  },
  calculator: {
    manifestHref: '/manifest-calculator.json',
    title:        'Calculator',
    appleTitle:   'Calculator',
    themeColor:   '#1c1c1e',
  },
  calendar: {
    manifestHref: '/manifest-calendar.json',
    title:        'Calendar',
    appleTitle:   'Calendar',
    themeColor:   '#ff3b30',
  },
  notepad: {
    manifestHref: '/manifest-notepad.json',
    title:        'Notes',
    appleTitle:   'Notes',
    themeColor:   '#fff8e1',
  },
}

/**
 * Apply the PWA identity to the document.
 * Must be called synchronously in bootstrap before any rendering.
 */
export function applyIdentity(maskEnabled: boolean, maskType: MaskType): void {
  const key   = maskEnabled ? maskType : 'real'
  const ident = IDENTITIES[key]

  // 1. <link rel="manifest">
  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'manifest'
    document.head.appendChild(link)
  }
  link.href = ident.manifestHref

  // 2. <title>
  document.title = ident.title

  // 3. apple-mobile-web-app-title
  setMeta('apple-mobile-web-app-title', ident.appleTitle)

  // 4. theme-color
  setMeta('theme-color', ident.themeColor, 'name')

  // 5. Notify Service Worker to cache the active manifest
  //    SW reads this and intercepts /manifest.json requests
  notifySW(ident.manifestHref)
}

/** Returns the identity config for the given mask state */
export function getIdentity(maskEnabled: boolean, maskType: MaskType): ManifestIdentity {
  return IDENTITIES[maskEnabled ? maskType : 'real']
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name'): void {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.content = content
}

/**
 * Tell the active Service Worker which manifest to serve for /manifest.json.
 * SW stores this in its own cache so it persists across page loads.
 */
function notifySW(manifestHref: string): void {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.ready.then(reg => {
    reg.active?.postMessage({
      type: 'SET_ACTIVE_MANIFEST',
      href: manifestHref,
    })
  }).catch(() => { /* SW not ready yet — harmless */ })
}
