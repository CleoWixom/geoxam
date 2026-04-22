/// <reference types="vite/client" />
/**
 * ManifestManager
 *
 * Applies PWA identity disguise BEFORE any UI mounts.
 * Reads BASE from the <base> tag or import.meta.env.BASE_URL injected by Vite.
 *
 * Swaps: <link rel="manifest">, <title>, apple meta tags, theme-color,
 *        apple-touch-icon, favicon.
 */

import type { MaskType } from '../types/index.js'

// Vite injects BASE_URL at build time from vite.config base option
// e.g. '/geoxam/' on GitHub Pages, '/' on custom domain
const BASE: string = (import.meta as { env: { BASE_URL: string } }).env.BASE_URL ?? '/'

export interface ManifestIdentity {
  manifestHref:  string
  title:         string
  appleTitle:    string
  themeColor:    string
  touchIcon:     string
}

const IDENTITIES: Record<'real' | MaskType, ManifestIdentity> = {
  real: {
    manifestHref: `${BASE}manifest.json`,
    title:        'GeoXam',
    appleTitle:   'GeoXam',
    themeColor:   '#000000',
    touchIcon:    `${BASE}icons/icon-real-192.png`,
  },
  calculator: {
    manifestHref: `${BASE}manifest-calculator.json`,
    title:        'Calculator',
    appleTitle:   'Calculator',
    themeColor:   '#1c1c1e',
    touchIcon:    `${BASE}icons/icon-calculator-192.png`,
  },
  calendar: {
    manifestHref: `${BASE}manifest-calendar.json`,
    title:        'Calendar',
    appleTitle:   'Calendar',
    themeColor:   '#ff3b30',
    touchIcon:    `${BASE}icons/icon-calendar-192.png`,
  },
  notepad: {
    manifestHref: `${BASE}manifest-notepad.json`,
    title:        'Notes',
    appleTitle:   'Notes',
    themeColor:   '#fff8e1',
    touchIcon:    `${BASE}icons/icon-notepad-192.png`,
  },
}

/**
 * Apply the PWA identity to the document.
 * Call synchronously in bootstrap before any rendering.
 */
export function applyIdentity(maskEnabled: boolean, maskType: MaskType): void {
  const ident = IDENTITIES[maskEnabled ? maskType : 'real']

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

  // 3. Apple meta tags
  setMeta('apple-mobile-web-app-title', ident.appleTitle)
  setMeta('theme-color', ident.themeColor)

  // 4. Apple touch icon
  let touchLink = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
  if (!touchLink) {
    touchLink = document.createElement('link')
    touchLink.rel = 'apple-touch-icon'
    document.head.appendChild(touchLink)
  }
  touchLink.href = ident.touchIcon

  // 5. Notify SW to serve the correct manifest for /manifest.json requests
  notifySW(ident.manifestHref)
}

export function getIdentity(maskEnabled: boolean, maskType: MaskType): ManifestIdentity {
  return IDENTITIES[maskEnabled ? maskType : 'real']
}

// ---------------------------------------------------------------------------

function setMeta(name: string, content: string): void {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', name)
    document.head.appendChild(el)
  }
  el.content = content
}

function notifySW(manifestHref: string): void {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.ready.then(reg => {
    reg.active?.postMessage({ type: 'SET_ACTIVE_MANIFEST', href: manifestHref })
  }).catch(() => {})
}
