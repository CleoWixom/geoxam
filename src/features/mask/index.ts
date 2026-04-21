/**
 * MaskManager — Phase 5 implementation
 *
 * Mounts the appropriate disguise UI (Calculator / Calendar / Notepad)
 * and manages the unlock flow (trigger detection → PIN/Pattern lock → emit mask:unlock).
 */

import { settingsDB } from '../../core/db/settings.js'
import { events } from '../../ui/events.js'
import { verifyCode } from '../../core/crypto/index.js'
import type { MaskType, MaskProtection } from '../../types/index.js'

// =============================================================================
// MaskManager
// =============================================================================
export class MaskManager {
  private container: HTMLElement | null = null
  private maskType: MaskType = 'calculator'
  private protection: MaskProtection = 'none'
  private codeHash = ''

  async mount(container: HTMLElement): Promise<void> {
    this.container = container
    this.maskType = await settingsDB.getSetting('mask.type')
    this.protection = await settingsDB.getSetting('mask.protection')
    this.codeHash = await settingsDB.getSetting('mask.codeHash')

    container.innerHTML = '<div id="mask-root"></div>'
    const root = container.querySelector<HTMLElement>('#mask-root')!

    switch (this.maskType) {
      case 'calculator': mountCalculator(root, () => this.triggerUnlock()); break
      case 'calendar':   mountCalendar(root, () => this.triggerUnlock());   break
      case 'notepad':    mountNotepad(root, () => this.triggerUnlock());     break
    }
  }

  private async triggerUnlock(): Promise<void> {
    if (this.protection === 'none') {
      events.emit('mask:unlock')
      return
    }
    if (this.protection === 'pin') {
      this.showPinLock()
    }
  }

  private showPinLock(): void {
    if (!this.container) return
    const overlay = document.createElement('div')
    overlay.className = 'pin-overlay'
    overlay.innerHTML = `
      <div class="pin-lock">
        <div class="pin-dots" id="pin-dots">
          <span></span><span></span><span></span><span></span>
        </div>
        <div class="pin-pad">
          ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k => `<button class="pin-key" data-key="${k}">${k}</button>`).join('')}
        </div>
        <div class="pin-error" id="pin-error"></div>
      </div>
    `

    let entry = ''
    let attempts = 0
    const MAX_ATTEMPTS = 3
    const LOCKOUT_MS = 30_000
    let locked = false

    const dotsEl = overlay.querySelector<HTMLElement>('#pin-dots')!
    const errorEl = overlay.querySelector<HTMLElement>('#pin-error')!

    const updateDots = () => {
      dotsEl.querySelectorAll('span').forEach((dot, i) => {
        dot.classList.toggle('filled', i < entry.length)
      })
    }

    const shake = () => {
      dotsEl.classList.add('shake')
      setTimeout(() => dotsEl.classList.remove('shake'), 500)
    }

    overlay.querySelector('.pin-pad')?.addEventListener('click', async (e) => {
      if (locked) return
      const key = (e.target as HTMLElement).dataset.key
      if (key === undefined || key === '') return

      if (key === '⌫') {
        entry = entry.slice(0, -1)
        updateDots()
        return
      }

      entry += key
      updateDots()

      if (entry.length >= 4) {
        const ok = await verifyCode(entry, this.codeHash)
        if (ok) {
          overlay.remove()
          events.emit('mask:unlock')
          return
        }

        attempts++
        entry = ''
        updateDots()
        shake()

        if (attempts >= MAX_ATTEMPTS) {
          locked = true
          let remaining = LOCKOUT_MS / 1000
          errorEl.textContent = `Try again in ${remaining}s`
          const countdown = setInterval(() => {
            remaining--
            if (remaining <= 0) {
              clearInterval(countdown)
              locked = false
              attempts = 0
              errorEl.textContent = ''
            } else {
              errorEl.textContent = `Try again in ${remaining}s`
            }
          }, 1000)
        } else {
          errorEl.textContent = `Wrong PIN (${attempts}/${MAX_ATTEMPTS})`
        }
      }
    })

    this.container!.appendChild(overlay)
  }

  unmount(): void {
    if (this.container) this.container.innerHTML = ''
  }
}

// =============================================================================
// Calculator Mask
// =============================================================================
function mountCalculator(root: HTMLElement, onUnlock: () => void): void {
  const UNLOCK_SEQ = '1337='   // default sequence
  let display = '0'
  let operand1: number | null = null
  let operator: string | null = null
  let justEvaluated = false
  let inputBuffer = ''

  const KEYS = [
    ['AC', '+/-', '%', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '−'],
    ['1', '2', '3', '+'],
    ['0', '0', '.', '='],
  ]

  root.className = 'mask-calculator'
  root.innerHTML = `
    <div class="calc-display">
      <div class="calc-display-inner" id="calc-display">0</div>
    </div>
    <div class="calc-keys" id="calc-keys">
      ${KEYS.flat().filter((v, i, a) => !(v === '0' && a[i-1] === '0')).map((key, i) => {
        const isOp = ['÷', '×', '−', '+', '='].includes(key)
        const isFunc = ['AC', '+/-', '%'].includes(key)
        const isZero = key === '0'
        return `<button class="calc-key ${isOp ? 'op' : isFunc ? 'func' : ''}${isZero ? ' zero' : ''}" data-key="${key}">${key}</button>`
      }).join('')}
    </div>
  `

  const displayEl = root.querySelector<HTMLElement>('#calc-display')!
  const keysEl = root.querySelector<HTMLElement>('#calc-keys')!

  // Track last 5 inputs for unlock sequence detection
  const history: string[] = []

  const updateDisplay = (val: string) => {
    displayEl.textContent = val.length > 9 ? parseFloat(val).toExponential(3) : val
  }

  keysEl.addEventListener('click', (e) => {
    const key = (e.target as HTMLElement).dataset.key
    if (!key) return

    // Track for unlock detection
    const isDigit = /\d/.test(key)
    const isEq = key === '='
    if (isDigit || isEq) {
      history.push(isDigit ? key : '=')
      if (history.length > UNLOCK_SEQ.length) history.shift()
      if (history.join('') === UNLOCK_SEQ) {
        onUnlock()
        return
      }
    }

    // Calculator logic
    if (key === 'AC') {
      display = '0'; operand1 = null; operator = null; justEvaluated = false; inputBuffer = ''
    } else if (key === '+/-') {
      display = String(-parseFloat(display))
    } else if (key === '%') {
      display = String(parseFloat(display) / 100)
    } else if (['÷', '×', '−', '+'].includes(key)) {
      operand1 = parseFloat(display)
      operator = key
      justEvaluated = false
      inputBuffer = ''
    } else if (key === '=') {
      if (operand1 !== null && operator) {
        const op2 = parseFloat(display)
        let result: number
        switch (operator) {
          case '÷': result = operand1 / op2; break
          case '×': result = operand1 * op2; break
          case '−': result = operand1 - op2; break
          case '+': result = operand1 + op2; break
          default:  result = op2
        }
        display = String(parseFloat(result.toFixed(10)))
        operand1 = null; operator = null; justEvaluated = true
      }
    } else if (key === '.') {
      if (!display.includes('.')) display += '.'
    } else {
      // Digit
      if (justEvaluated || display === '0') {
        display = key
        justEvaluated = false
      } else if (display.replace('-', '').length < 9) {
        display += key
      }
    }

    updateDisplay(display)
  })
}

// =============================================================================
// Calendar Mask
// =============================================================================
function mountCalendar(root: HTMLElement, onUnlock: () => void): void {
  let viewYear = new Date().getFullYear()
  let viewMonth = new Date().getMonth()
  const today = new Date()

  let tapCount = 0
  let tapTimer: number | null = null

  root.className = 'mask-calendar'

  const render = () => {
    const monthName = new Date(viewYear, viewMonth).toLocaleString('default', { month: 'long' })
    const firstDay = new Date(viewYear, viewMonth, 1).getDay()
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const daysInPrev = new Date(viewYear, viewMonth, 0).getDate()

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    let cells = ''
    for (let i = 0; i < firstDay; i++) {
      cells += `<div class="cal-day other">${daysInPrev - firstDay + 1 + i}</div>`
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === d
      cells += `<div class="cal-day${isToday ? ' today' : ''}" data-day="${d}">${d}</div>`
    }
    const remaining = 42 - firstDay - daysInMonth
    for (let d = 1; d <= remaining; d++) {
      cells += `<div class="cal-day other">${d}</div>`
    }

    root.innerHTML = `
      <div class="cal-header">
        <button class="cal-nav" id="cal-prev">‹</button>
        <div class="cal-title">${monthName} ${viewYear}</div>
        <button class="cal-nav" id="cal-next">›</button>
      </div>
      <div class="cal-grid">
        ${dayNames.map(d => `<div class="cal-day-name">${d}</div>`).join('')}
        ${cells}
      </div>
    `

    root.querySelector('#cal-prev')?.addEventListener('click', () => {
      viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear-- }; render()
    })
    root.querySelector('#cal-next')?.addEventListener('click', () => {
      viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++ }; render()
    })

    // Unlock: tap today 3× within 1.5s
    root.querySelectorAll('.cal-day.today').forEach(el => {
      el.addEventListener('click', () => {
        tapCount++
        if (tapTimer !== null) clearTimeout(tapTimer)
        tapTimer = window.setTimeout(() => { tapCount = 0 }, 1500)
        if (tapCount >= 3) {
          tapCount = 0
          if (tapTimer !== null) clearTimeout(tapTimer)
          onUnlock()
        }
      })
    })
  }

  render()
}

// =============================================================================
// Notepad Mask
// =============================================================================
function mountNotepad(root: HTMLElement, onUnlock: () => void): void {
  root.className = 'mask-notepad'

  let content = ''
  let cornerArmed = false
  let cornerTimer: number | null = null

  settingsDB.getSetting('mask.notepadContent').then(saved => {
    content = saved
    textarea.value = content
    updateCount()
  })

  root.innerHTML = `
    <div class="notepad-header">
      <span class="notepad-title">Notes</span>
      <span class="notepad-count" id="notepad-count">0 words</span>
      <div class="notepad-corner-zone" id="corner-zone"></div>
    </div>
    <textarea class="notepad-textarea" id="notepad-textarea" placeholder="Start typing…" spellcheck="true"></textarea>
  `

  const textarea = root.querySelector<HTMLTextAreaElement>('#notepad-textarea')!
  const countEl = root.querySelector<HTMLElement>('#notepad-count')!
  const cornerZone = root.querySelector<HTMLElement>('#corner-zone')!

  // Corner tap detection
  cornerZone.addEventListener('click', () => {
    if (cornerArmed) {
      cornerArmed = false
      if (cornerTimer !== null) clearTimeout(cornerTimer)
      onUnlock()
    }
  })

  let saveTimer: number | null = null

  const updateCount = () => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0
    countEl.textContent = `${words} word${words !== 1 ? 's' : ''}`
  }

  textarea.addEventListener('input', () => {
    content = textarea.value

    // Detect ::: trigger sequence
    if (content.endsWith(':::')) {
      // Remove ::: silently
      content = content.slice(0, -3)
      textarea.value = content

      // Arm corner zone for 2 seconds
      cornerArmed = true
      if (cornerTimer !== null) clearTimeout(cornerTimer)
      cornerTimer = window.setTimeout(() => { cornerArmed = false }, 2000)
    }

    updateCount()

    // Debounce save
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      settingsDB.setSetting('mask.notepadContent', content)
    }, 500)
  })
}
