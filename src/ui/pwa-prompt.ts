/**
 * PWA helpers:
 *  - iOS "Add to Home Screen" install banner (shown once, dismissed forever)
 *  - Offline / online status indicator toast
 */

import { toast } from './toast.js'

// =============================================================================
// iOS install prompt
// =============================================================================

const IOS_PROMPT_KEY = 'geoxam_ios_prompt_dismissed'

/** Returns true if running in iOS Safari in browser (not standalone) */
function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone(): boolean {
  return (navigator as { standalone?: boolean }).standalone === true
    || window.matchMedia('(display-mode: standalone)').matches
}

export function maybeShowIOSPrompt(): void {
  if (!isIOS() || isStandalone()) return
  if (sessionStorage.getItem(IOS_PROMPT_KEY)) return

  const banner = document.createElement('div')
  banner.id = 'ios-install-banner'
  banner.style.cssText = `
    position: fixed;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
    left: 12px;
    right: 12px;
    z-index: 9000;
    background: rgba(28,28,30,0.97);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 16px;
    padding: 16px 16px 16px 14px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    animation: slide-up 0.3s ease;
  `

  // Get current app identity for the banner
  const title = document.title || 'this app'
  const icon  = (document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]'))?.href
    ?? '/icons/icon-real-192.png'

  banner.innerHTML = /* html */`
    <img src="${icon}" alt=""
      style="width:48px;height:48px;border-radius:10px;flex-shrink:0;object-fit:cover;">
    <div style="flex:1;min-width:0;">
      <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:4px;">
        Install ${title}
      </div>
      <div style="font-size:12px;color:rgba(255,255,255,0.6);line-height:1.5;">
        Tap <strong style="color:#fff;">Share</strong>
        <span style="font-size:14px;">⬆️</span>
        then <strong style="color:#fff;">Add to Home Screen</strong>
        to use offline
      </div>
    </div>
    <button id="ios-prompt-close"
      style="color:rgba(255,255,255,0.4);font-size:22px;line-height:1;
             flex-shrink:0;padding:4px;align-self:flex-start;">✕</button>
  `

  document.body.appendChild(banner)

  banner.querySelector('#ios-prompt-close')!.addEventListener('click', () => {
    banner.remove()
    sessionStorage.setItem(IOS_PROMPT_KEY, '1')
  })

  // Auto-dismiss after 12 seconds
  setTimeout(() => {
    if (banner.isConnected) {
      banner.style.opacity = '0'
      banner.style.transition = 'opacity 0.4s'
      setTimeout(() => banner.remove(), 400)
    }
  }, 12_000)
}

// Inject keyframe for slide-up animation (only once)
if (!document.getElementById('pwa-prompt-styles')) {
  const style = document.createElement('style')
  style.id = 'pwa-prompt-styles'
  style.textContent = `
    @keyframes slide-up {
      from { transform: translateY(20px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
  `
  document.head.appendChild(style)
}

// =============================================================================
// Offline / online indicator
// =============================================================================

let wasOffline = false

export function initOfflineDetection(): void {
  window.addEventListener('online', () => {
    if (wasOffline) {
      toast('Back online', 'success', { duration: 2000 })
      wasOffline = false
    }
  })

  window.addEventListener('offline', () => {
    wasOffline = true
    toast('You are offline — photos still save locally', 'warning', { duration: 4000 })
  })
}
