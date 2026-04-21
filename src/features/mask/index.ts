/**
 * Mask system — full implementation
 * Calculator (working arithmetic + 1337= unlock)
 * Calendar (working month nav + triple-tap today unlock)
 * Notepad (persistent text + :::+corner-tap unlock)
 * PIN overlay with shake animation + 30s lockout
 */

import { settingsDB } from '../../core/db/settings.js'
import { events } from '../../ui/events.js'
import { verifyCode } from '../../core/crypto/index.js'
import type { MaskType } from '../../types/index.js'

export class MaskManager {
  private container: HTMLElement | null = null

  async mount(container: HTMLElement): Promise<void> {
    this.container = container

    const [type, protection, codeHash] = await Promise.all([
      settingsDB.getSetting('mask.type'),
      settingsDB.getSetting('mask.protection'),
      settingsDB.getSetting('mask.codeHash'),
    ])

    container.innerHTML = '<div id="mask-root"></div>'
    const root = container.querySelector<HTMLElement>('#mask-root')!

    const onTrigger = () => {
      if (protection === 'none') {
        events.emit('mask:unlock')
      } else if (protection === 'pin') {
        showPinLock(root, codeHash, () => events.emit('mask:unlock'))
      }
      // Pattern: Phase 5 extension
    }

    const mountFn = MASKS[type]
    mountFn(root, onTrigger)
  }

  unmount(): void {
    if (this.container) this.container.innerHTML = ''
  }
}

const MASKS: Record<MaskType, (root: HTMLElement, onUnlock: () => void) => void> = {
  calculator: mountCalculator,
  calendar:   mountCalendar,
  notepad:    mountNotepad,
}

// =============================================================================
// Calculator
// =============================================================================
function mountCalculator(root: HTMLElement, onUnlock: () => void): void {
  root.className = 'mask-calculator'

  // State
  let display   = '0'
  let stored    = 0
  let operator: string | null = null
  let fresh     = false  // next digit clears display
  const history: string[] = []   // last N keystrokes for unlock detection

  const UNLOCK = '1337='

  root.innerHTML = /* html */`
    <div class="calc-display">
      <div class="calc-display-inner" id="calc-display">0</div>
    </div>
    <div class="calc-keys" id="calc-keys"></div>
  `

  // Build keypad
  const ROWS = [
    ['AC', '+/-', '%', '÷'],
    ['7',  '8',   '9', '×'],
    ['4',  '5',   '6', '−'],
    ['1',  '2',   '3', '+'],
  ]
  const keysEl = root.querySelector<HTMLElement>('#calc-keys')!
  const displayEl = root.querySelector<HTMLElement>('#calc-display')!

  for (const row of ROWS) {
    for (const key of row) {
      keysEl.appendChild(makeKey(key))
    }
  }
  // Bottom row: wide 0, dot, equals
  keysEl.appendChild(makeKey('0', true))
  keysEl.appendChild(makeKey('.'))
  keysEl.appendChild(makeKey('='))

  function makeKey(key: string, wide = false): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.className = 'calc-key' +
      (['÷','×','−','+','='].includes(key) ? ' op' : '') +
      (['AC','+/-','%'].includes(key) ? ' func' : '') +
      (wide ? ' zero' : '')
    btn.dataset.key = key
    btn.textContent = key
    return btn
  }

  function setDisplay(val: string) {
    const n = parseFloat(val)
    if (!isNaN(n) && Math.abs(n) >= 1e9) {
      displayEl.textContent = n.toExponential(3)
    } else {
      displayEl.textContent = val.length > 10 ? parseFloat(val).toPrecision(7) : val
    }
    // Scale font for long numbers
    const len = displayEl.textContent!.length
    ;(displayEl as HTMLElement).style.fontSize = len > 10 ? '44px' : len > 7 ? '58px' : '72px'
  }

  keysEl.addEventListener('click', e => {
    const key = (e.target as HTMLElement).dataset.key
    if (!key) return

    // Track keystrokes for unlock
    if (/\d/.test(key) || key === '=') {
      history.push(key === '=' ? '=' : key)
      if (history.length > UNLOCK.length) history.shift()
      if (history.join('') === UNLOCK) { onUnlock(); return }
    }

    if (key === 'AC') {
      display = '0'; stored = 0; operator = null; fresh = false

    } else if (key === '+/-') {
      display = String(-parseFloat(display) || 0)

    } else if (key === '%') {
      display = String(parseFloat(display) / 100)

    } else if (['÷','×','−','+'].includes(key)) {
      stored = parseFloat(display)
      operator = key
      fresh = true

    } else if (key === '=') {
      if (operator) {
        const rhs = parseFloat(display)
        const ops: Record<string, (a: number, b: number) => number> = {
          '÷': (a,b) => b !== 0 ? a / b : NaN,
          '×': (a,b) => a * b,
          '−': (a,b) => a - b,
          '+': (a,b) => a + b,
        }
        const result = ops[operator](stored, rhs)
        display = isNaN(result) ? 'Error' : String(parseFloat(result.toFixed(10)))
        operator = null; fresh = true
      }

    } else if (key === '.') {
      if (fresh) { display = '0.'; fresh = false }
      else if (!display.includes('.')) display += '.'

    } else {
      // Digit
      if (fresh || display === '0') { display = key; fresh = false }
      else if (display !== 'Error' && display.replace('-','').length < 10) display += key
    }

    setDisplay(display)
  })
}

// =============================================================================
// Calendar
// =============================================================================
function mountCalendar(root: HTMLElement, onUnlock: () => void): void {
  root.className = 'mask-calendar'

  const now   = new Date()
  let year    = now.getFullYear()
  let month   = now.getMonth()

  let tapCount = 0
  let tapTimer: ReturnType<typeof setTimeout> | null = null

  function render() {
    const monthName = new Date(year, month).toLocaleString('default', { month: 'long' })
    const firstDay  = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const prevDays    = new Date(year, month, 0).getDate()
    const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

    let cells = ''
    for (let i = 0; i < firstDay; i++)
      cells += `<div class="cal-day other">${prevDays - firstDay + 1 + i}</div>`
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = now.getFullYear()===year && now.getMonth()===month && now.getDate()===d
      cells += `<div class="cal-day${isToday ? ' today' : ''}" data-day="${d}">${d}</div>`
    }
    const trailing = 42 - firstDay - daysInMonth
    for (let d = 1; d <= trailing; d++)
      cells += `<div class="cal-day other">${d}</div>`

    root.innerHTML = /* html */`
      <div class="cal-header">
        <button class="cal-nav" id="cal-prev">‹</button>
        <div class="cal-title">${monthName} ${year}</div>
        <button class="cal-nav" id="cal-next">›</button>
      </div>
      <div class="cal-grid">
        ${DAY_NAMES.map(d => `<div class="cal-day-name">${d}</div>`).join('')}
        ${cells}
      </div>
    `

    root.querySelector('#cal-prev')!.addEventListener('click', () => {
      month--; if (month < 0) { month = 11; year-- }; render()
    })
    root.querySelector('#cal-next')!.addEventListener('click', () => {
      month++; if (month > 11) { month = 0; year++ }; render()
    })

    root.querySelectorAll('.cal-day.today').forEach(el => {
      el.addEventListener('click', () => {
        tapCount++
        if (tapTimer) clearTimeout(tapTimer)
        tapTimer = setTimeout(() => { tapCount = 0 }, 1500)
        if (tapCount >= 3) {
          tapCount = 0
          if (tapTimer) clearTimeout(tapTimer)
          onUnlock()
        }
      })
    })
  }

  render()
}

// =============================================================================
// Notepad
// =============================================================================
function mountNotepad(root: HTMLElement, onUnlock: () => void): void {
  root.className = 'mask-notepad'
  root.innerHTML = /* html */`
    <div class="notepad-header">
      <span class="notepad-title">Notes</span>
      <span class="notepad-count" id="np-count">0 words</span>
      <div class="notepad-corner-zone" id="np-corner"></div>
    </div>
    <textarea class="notepad-textarea" id="np-area" placeholder="Start typing…" spellcheck="true"></textarea>
  `

  const area    = root.querySelector<HTMLTextAreaElement>('#np-area')!
  const countEl = root.querySelector<HTMLElement>('#np-count')!
  const corner  = root.querySelector<HTMLElement>('#np-corner')!

  let cornerArmed = false
  let cornerTimer: ReturnType<typeof setTimeout> | null = null
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  // Load saved text
  settingsDB.getSetting('mask.notepadContent').then(saved => {
    area.value = saved
    updateCount()
  })

  corner.addEventListener('click', () => {
    if (cornerArmed) {
      if (cornerTimer) clearTimeout(cornerTimer)
      cornerArmed = false
      onUnlock()
    }
  })

  function updateCount() {
    const words = area.value.trim() ? area.value.trim().split(/\s+/).length : 0
    countEl.textContent = `${words} word${words !== 1 ? 's' : ''}`
  }

  area.addEventListener('input', () => {
    // Detect ::: trigger
    if (area.value.endsWith(':::')) {
      area.value = area.value.slice(0, -3)
      cornerArmed = true
      if (cornerTimer) clearTimeout(cornerTimer)
      cornerTimer = setTimeout(() => { cornerArmed = false }, 2000)
    }
    updateCount()
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => settingsDB.setSetting('mask.notepadContent', area.value), 500)
  })
}

// =============================================================================
// PIN Lock overlay
// =============================================================================
function showPinLock(parent: HTMLElement, codeHash: string, onSuccess: () => void): void {
  const overlay = document.createElement('div')
  overlay.className = 'pin-overlay'
  overlay.innerHTML = /* html */`
    <div class="pin-lock">
      <div class="pin-dots" id="pin-dots">
        <span></span><span></span><span></span><span></span>
      </div>
      <div class="pin-pad" id="pin-pad">
        ${[1,2,3,4,5,6,7,8,9].map(k => `<button class="pin-key" data-key="${k}">${k}</button>`).join('')}
        <button class="pin-key" data-key="" style="visibility:hidden"></button>
        <button class="pin-key" data-key="0">0</button>
        <button class="pin-key" data-key="⌫">⌫</button>
      </div>
      <div class="pin-error" id="pin-error"></div>
    </div>
  `

  let entry    = ''
  let attempts = 0
  let locked   = false

  const dotsEl  = overlay.querySelector<HTMLElement>('#pin-dots')!
  const errorEl = overlay.querySelector<HTMLElement>('#pin-error')!

  const updateDots = () => {
    dotsEl.querySelectorAll('span').forEach((s, i) => s.classList.toggle('filled', i < entry.length))
  }

  const shake = () => {
    dotsEl.classList.add('shake')
    dotsEl.addEventListener('animationend', () => dotsEl.classList.remove('shake'), { once: true })
  }

  overlay.querySelector('#pin-pad')!.addEventListener('click', async e => {
    if (locked) return
    const key = (e.target as HTMLElement).dataset.key
    if (key === undefined || key === '') return

    if (key === '⌫') { entry = entry.slice(0, -1); updateDots(); return }

    entry += key
    updateDots()

    if (entry.length >= 4) {
      const ok = await verifyCode(entry, codeHash)
      if (ok) { overlay.remove(); onSuccess(); return }

      attempts++
      entry = ''
      updateDots()
      shake()

      if (attempts >= 3) {
        locked = true
        let t = 30
        errorEl.textContent = `Try again in ${t}s`
        const cd = setInterval(() => {
          t--
          if (t <= 0) { clearInterval(cd); locked = false; attempts = 0; errorEl.textContent = '' }
          else errorEl.textContent = `Try again in ${t}s`
        }, 1000)
      } else {
        errorEl.textContent = `Wrong PIN (${attempts}/3)`
      }
    }
  })

  parent.appendChild(overlay)
}
