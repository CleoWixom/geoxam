/**
 * Mask system — Calculator, Calendar, Notepad + PIN + Pattern lock
 */

import { settingsDB } from '../../core/db/settings.js'
import { events } from '../../ui/events.js'
import { verifyCode, verifyPattern } from '../../core/crypto/index.js'
import type { MaskType, MaskProtection } from '../../types/index.js'

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

    const onTrigger = () => showProtection(root, protection, codeHash, () => events.emit('mask:unlock'))
    MASKS[type as MaskType](root, onTrigger)
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
// Protection router
// =============================================================================
function showProtection(
  parent: HTMLElement,
  protection: MaskProtection,
  codeHash: string,
  onSuccess: () => void
): void {
  if (protection === 'none') { onSuccess(); return }
  if (protection === 'pin')     showPinLock(parent, codeHash, onSuccess)
  if (protection === 'pattern') showPatternLock(parent, codeHash, onSuccess)
}

// =============================================================================
// Calculator
// =============================================================================
function mountCalculator(root: HTMLElement, onUnlock: () => void): void {
  root.className = 'mask-calculator'

  let display = '0'
  let stored  = 0
  let op: string | null = null
  let fresh   = false
  const history: string[] = []

  root.innerHTML = /* html */`
    <div class="calc-display">
      <div class="calc-display-inner" id="calc-display">0</div>
    </div>
    <div class="calc-keys" id="calc-keys"></div>
  `

  const displayEl = root.querySelector<HTMLElement>('#calc-display')!
  const keysEl    = root.querySelector<HTMLElement>('#calc-keys')!

  // Build keypad rows
  const ROWS = [
    ['AC','+/-','%','÷'],
    ['7','8','9','×'],
    ['4','5','6','−'],
    ['1','2','3','+'],
  ]
  for (const row of ROWS) {
    for (const key of row) keysEl.appendChild(makeKey(key))
  }
  keysEl.appendChild(makeKey('0', true))
  keysEl.appendChild(makeKey('.'))
  keysEl.appendChild(makeKey('='))

  function makeKey(k: string, wide = false): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.className = 'calc-key'
      + (['÷','×','−','+','='].includes(k) ? ' op' : '')
      + (['AC','+/-','%'].includes(k) ? ' func' : '')
      + (wide ? ' zero' : '')
    btn.dataset.key = k
    btn.textContent = k
    return btn
  }

  const UNLOCK_SEQ = '1337='

  function setDisplay(val: string): void {
    const n = parseFloat(val)
    const text = !isNaN(n) && Math.abs(n) >= 1e10
      ? n.toExponential(3)
      : val.length > 10 ? parseFloat(val).toPrecision(7) : val
    displayEl.textContent = text
    displayEl.style.fontSize =
      (text.length > 10 ? 42 : text.length > 7 ? 58 : 72) + 'px'
  }

  keysEl.addEventListener('click', e => {
    const key = (e.target as HTMLElement).dataset.key
    if (!key) return

    // Unlock sequence tracking (digits + '=')
    if (/^\d$/.test(key) || key === '=') {
      history.push(key)
      if (history.length > UNLOCK_SEQ.length) history.shift()
      if (history.join('') === UNLOCK_SEQ) { onUnlock(); return }
    }

    if (key === 'AC') {
      display = '0'; stored = 0; op = null; fresh = false
    } else if (key === '+/-') {
      display = String(-parseFloat(display) || 0)
    } else if (key === '%') {
      display = String(parseFloat(display) / 100)
    } else if (['÷','×','−','+'].includes(key)) {
      stored = parseFloat(display); op = key; fresh = true
    } else if (key === '=') {
      if (op !== null) {
        const b = parseFloat(display)
        const OPS: Record<string, (a: number, b: number) => number> = {
          '÷': (a,b) => b ? a/b : NaN,
          '×': (a,b) => a*b,
          '−': (a,b) => a-b,
          '+': (a,b) => a+b,
        }
        const r = OPS[op](stored, b)
        display = isNaN(r) ? 'Error' : String(parseFloat(r.toFixed(10)))
        op = null; fresh = true
      }
    } else if (key === '.') {
      if (fresh) { display = '0.'; fresh = false }
      else if (!display.includes('.')) display += '.'
    } else {
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
  const now = new Date()
  let year = now.getFullYear(), month = now.getMonth()
  let tapCount = 0
  let tapTimer: ReturnType<typeof setTimeout> | null = null

  function render(): void {
    const monthName = new Date(year, month).toLocaleString('default', { month: 'long' })
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const prevDays = new Date(year, month, 0).getDate()

    let cells = ''
    for (let i = 0; i < firstDay; i++)
      cells += `<div class="cal-day other">${prevDays - firstDay + 1 + i}</div>`
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = now.getFullYear()===year && now.getMonth()===month && now.getDate()===d
      cells += `<div class="cal-day${isToday?' today':''}" data-day="${d}">${d}</div>`
    }
    const tail = 42 - firstDay - daysInMonth
    for (let d = 1; d <= tail; d++)
      cells += `<div class="cal-day other">${d}</div>`

    root.innerHTML = /* html */`
      <div class="cal-header">
        <button class="cal-nav" id="prev">‹</button>
        <div class="cal-title">${monthName} ${year}</div>
        <button class="cal-nav" id="next">›</button>
      </div>
      <div class="cal-grid">
        ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-day-name">${d}</div>`).join('')}
        ${cells}
      </div>
    `
    root.querySelector('#prev')!.addEventListener('click', () => {
      month--; if (month<0){month=11;year--}; render()
    })
    root.querySelector('#next')!.addEventListener('click', () => {
      month++; if (month>11){month=0;year++}; render()
    })
    root.querySelectorAll('.cal-day.today').forEach(el => {
      el.addEventListener('click', () => {
        tapCount++
        if (tapTimer) clearTimeout(tapTimer)
        tapTimer = setTimeout(() => { tapCount = 0 }, 1500)
        if (tapCount >= 3) { tapCount = 0; if (tapTimer) clearTimeout(tapTimer); onUnlock() }
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
  let saveTimer:   ReturnType<typeof setTimeout> | null = null

  settingsDB.getSetting('mask.notepadContent').then(saved => {
    area.value = saved; updateCount()
  })

  corner.addEventListener('click', () => {
    if (cornerArmed) { if (cornerTimer) clearTimeout(cornerTimer); cornerArmed = false; onUnlock() }
  })

  function updateCount(): void {
    const w = area.value.trim() ? area.value.trim().split(/\s+/).length : 0
    countEl.textContent = `${w} word${w !== 1 ? 's' : ''}`
  }

  area.addEventListener('input', () => {
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
// PIN Lock
// =============================================================================
function showPinLock(parent: HTMLElement, codeHash: string, onSuccess: () => void): void {
  const overlay = document.createElement('div')
  overlay.className = 'pin-overlay'
  overlay.innerHTML = /* html */`
    <div class="pin-lock">
      <div class="pin-dots" id="pin-dots">
        <span></span><span></span><span></span><span></span>
      </div>
      <div class="pin-pad">
        ${[1,2,3,4,5,6,7,8,9].map(k=>`<button class="pin-key" data-key="${k}">${k}</button>`).join('')}
        <button class="pin-key" data-key="" style="visibility:hidden"></button>
        <button class="pin-key" data-key="0">0</button>
        <button class="pin-key" data-key="⌫">⌫</button>
      </div>
      <div class="pin-error" id="pin-error"></div>
    </div>
  `

  let entry = '', attempts = 0, locked = false
  const dotsEl  = overlay.querySelector<HTMLElement>('#pin-dots')!
  const errorEl = overlay.querySelector<HTMLElement>('#pin-error')!

  const updateDots = () =>
    dotsEl.querySelectorAll('span').forEach((s,i) => s.classList.toggle('filled', i < entry.length))

  const shake = () => {
    dotsEl.classList.add('shake')
    dotsEl.addEventListener('animationend', () => dotsEl.classList.remove('shake'), { once: true })
  }

  const startLockout = () => {
    locked = true; let t = 30
    errorEl.textContent = `Try again in ${t}s`
    const cd = setInterval(() => {
      t--
      if (t <= 0) { clearInterval(cd); locked = false; attempts = 0; errorEl.textContent = '' }
      else errorEl.textContent = `Try again in ${t}s`
    }, 1000)
  }

  overlay.querySelector('.pin-pad')!.addEventListener('click', async e => {
    if (locked) return
    const key = (e.target as HTMLElement).dataset.key
    if (key === undefined || key === '') return
    if (key === '⌫') { entry = entry.slice(0,-1); updateDots(); return }
    entry += key; updateDots()
    if (entry.length >= 4) {
      if (await verifyCode(entry, codeHash)) { overlay.remove(); onSuccess(); return }
      attempts++; entry = ''; updateDots(); shake()
      if (attempts >= 3) startLockout()
      else errorEl.textContent = `Wrong PIN (${attempts}/3)`
    }
  })

  parent.appendChild(overlay)
}

// =============================================================================
// Pattern Lock
// =============================================================================
function showPatternLock(parent: HTMLElement, codeHash: string, onSuccess: () => void): void {
  const overlay = document.createElement('div')
  overlay.className = 'pin-overlay'
  overlay.innerHTML = /* html */`
    <div class="pin-lock">
      <p style="color:var(--clr-text-2);font-size:14px;margin-bottom:24px;text-align:center;">
        Draw your pattern
      </p>
      <canvas id="pattern-canvas" width="280" height="280"
        style="display:block;margin:0 auto;touch-action:none;"></canvas>
      <div class="pin-error" id="pattern-error" style="margin-top:20px;"></div>
    </div>
  `

  const canvas  = overlay.querySelector<HTMLCanvasElement>('#pattern-canvas')!
  const errorEl = overlay.querySelector<HTMLElement>('#pattern-error')!
  const ctx     = canvas.getContext('2d')!

  const COLS = 3, ROWS = 3
  const DOT_R = 14, HIT_R = 36
  const W = canvas.width, H = canvas.height

  // Dot positions
  const dots: Array<{ x: number; y: number }> = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      dots.push({
        x: W * (c + 1) / (COLS + 1),
        y: H * (r + 1) / (ROWS + 1),
      })
    }
  }

  let sequence: number[] = []
  let drawing = false
  let cursor = { x: 0, y: 0 }
  let attempts = 0, locked = false

  function hitDot(px: number, py: number): number {
    return dots.findIndex((d, i) =>
      !sequence.includes(i) &&
      Math.hypot(px - d.x, py - d.y) < HIT_R
    )
  }

  function draw(): void {
    ctx.clearRect(0, 0, W, H)

    // Lines between connected dots
    ctx.strokeStyle = '#0a84ff'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    if (sequence.length > 1) {
      ctx.beginPath()
      ctx.moveTo(dots[sequence[0]].x, dots[sequence[0]].y)
      for (let i = 1; i < sequence.length; i++)
        ctx.lineTo(dots[sequence[i]].x, dots[sequence[i]].y)
      if (drawing) ctx.lineTo(cursor.x, cursor.y)
      ctx.stroke()
    }

    // Dots
    for (let i = 0; i < dots.length; i++) {
      const active = sequence.includes(i)
      ctx.beginPath()
      ctx.arc(dots[i].x, dots[i].y, DOT_R, 0, Math.PI * 2)
      ctx.fillStyle = active ? '#0a84ff' : 'rgba(255,255,255,0.25)'
      ctx.fill()
      if (active) {
        ctx.beginPath()
        ctx.arc(dots[i].x, dots[i].y, DOT_R * 0.45, 0, Math.PI * 2)
        ctx.fillStyle = '#fff'
        ctx.fill()
      }
    }
  }

  function getPos(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect()
    const scaleX = W / rect.width
    const scaleY = H / rect.height
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  canvas.addEventListener('pointerdown', e => {
    if (locked) return
    drawing = true
    sequence = []
    errorEl.textContent = ''
    const pos = getPos(e)
    cursor = pos
    const hit = hitDot(pos.x, pos.y)
    if (hit !== -1) sequence.push(hit)
    draw()
  })

  canvas.addEventListener('pointermove', e => {
    if (!drawing || locked) return
    const pos = getPos(e)
    cursor = pos
    const hit = hitDot(pos.x, pos.y)
    if (hit !== -1) sequence.push(hit)
    draw()
  })

  canvas.addEventListener('pointerup', async () => {
    if (!drawing || locked) return
    drawing = false
    draw()

    if (sequence.length < 4) {
      errorEl.textContent = 'Connect at least 4 dots'
      setTimeout(() => { sequence = []; draw() }, 800)
      return
    }

    if (await verifyPattern(sequence, codeHash)) {
      overlay.remove(); onSuccess(); return
    }

    // Wrong
    attempts++
    ctx.strokeStyle = '#ff3b30'
    ctx.lineWidth = 3
    if (sequence.length > 1) {
      ctx.beginPath()
      ctx.moveTo(dots[sequence[0]].x, dots[sequence[0]].y)
      for (let i = 1; i < sequence.length; i++)
        ctx.lineTo(dots[sequence[i]].x, dots[sequence[i]].y)
      ctx.stroke()
    }

    if (attempts >= 3) {
      locked = true; let t = 30
      errorEl.textContent = `Try again in ${t}s`
      const cd = setInterval(() => {
        t--
        if (t <= 0) { clearInterval(cd); locked = false; attempts = 0; errorEl.textContent = '' }
        else errorEl.textContent = `Try again in ${t}s`
      }, 1000)
    } else {
      errorEl.textContent = `Wrong pattern (${attempts}/3)`
    }

    setTimeout(() => { sequence = []; draw() }, 700)
  })

  draw()
  parent.appendChild(overlay)
}
