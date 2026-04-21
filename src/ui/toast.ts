// =============================================================================
// Toast Notification System
// Zero dependencies. Appends to document.body. Auto-removes after duration.
// =============================================================================

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastOptions {
  duration?: number     // ms, default 3000
  action?: { label: string; onClick: () => void }
}

let container: HTMLElement | null = null

function getContainer(): HTMLElement {
  if (!container) {
    container = document.createElement('div')
    container.id = 'toast-container'
    container.style.cssText = `
      position: fixed;
      bottom: calc(env(safe-area-inset-bottom, 0px) + 80px);
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      display: flex;
      flex-direction: column-reverse;
      align-items: center;
      gap: 8px;
      pointer-events: none;
      width: calc(100% - 32px);
      max-width: 360px;
    `
    document.body.appendChild(container)
  }
  return container
}

export function toast(message: string, type: ToastType = 'info', opts: ToastOptions = {}): void {
  const { duration = 3000, action } = opts

  const el = document.createElement('div')

  const bgColor = {
    success: '#1c7c54',
    error:   '#c0392b',
    info:    '#1a1a2e',
    warning: '#b7791f',
  }[type]

  el.style.cssText = `
    background: ${bgColor};
    color: #fff;
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 14px;
    font-family: -apple-system, sans-serif;
    pointer-events: auto;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    animation: toast-in 0.2s ease;
  `

  const text = document.createElement('span')
  text.textContent = message
  el.appendChild(text)

  if (action) {
    const btn = document.createElement('button')
    btn.textContent = action.label
    btn.style.cssText = `
      background: rgba(255,255,255,0.2);
      border: none;
      color: #fff;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      white-space: nowrap;
    `
    btn.onclick = () => {
      action.onClick()
      remove()
    }
    el.appendChild(btn)
  }

  const remove = () => {
    el.style.opacity = '0'
    el.style.transition = 'opacity 0.2s'
    setTimeout(() => el.remove(), 200)
  }

  getContainer().appendChild(el)
  const timer = setTimeout(remove, duration)
  el.onclick = () => { clearTimeout(timer); remove() }
}

// Inject keyframe animation once
const style = document.createElement('style')
style.textContent = `@keyframes toast-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }`
document.head.appendChild(style)
