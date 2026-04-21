import { describe, it, expect } from 'vitest'
import {
  toDMS,
  formatDMS,
  formatDecimal,
  formatAccuracy,
  formatAltitude,
  buildOverlayLines,
} from '../../../src/core/geo/formatter'

describe('toDMS', () => {
  it('formats positive latitude', () => {
    expect(toDMS(52.3625, true)).toBe('52°21\'45.0"N')
  })

  it('formats negative latitude (South)', () => {
    expect(toDMS(-33.8688, true)).toContain('S')
  })

  it('formats positive longitude (East)', () => {
    expect(toDMS(5.1233, false)).toContain('E')
  })

  it('formats negative longitude (West)', () => {
    expect(toDMS(-73.9857, false)).toContain('W')
  })

  it('handles zero', () => {
    expect(toDMS(0, true)).toBe('0°0\'0.0"N')
  })
})

describe('formatAccuracy', () => {
  it('shows metres for small values', () => {
    expect(formatAccuracy(12)).toBe('±12 m')
    expect(formatAccuracy(850)).toBe('±850 m')
  })

  it('switches to km above 1000m', () => {
    expect(formatAccuracy(1500)).toBe('±1.5 km')
    expect(formatAccuracy(2000)).toBe('±2.0 km')
  })

  it('rounds metres', () => {
    expect(formatAccuracy(12.7)).toBe('±13 m')
  })
})

describe('formatDecimal', () => {
  it('formats correctly with direction letters', () => {
    const result = formatDecimal(52.362556, 5.123361)
    expect(result).toContain('N')
    expect(result).toContain('E')
    expect(result).toContain('52.362556')
  })

  it('handles negative coordinates', () => {
    const result = formatDecimal(-33.8688, -70.6693)
    expect(result).toContain('S')
    expect(result).toContain('W')
  })
})

describe('formatAltitude', () => {
  it('includes accuracy when provided', () => {
    expect(formatAltitude(14.3, 3)).toBe('14.3 m ±3 m')
  })

  it('omits accuracy when null', () => {
    expect(formatAltitude(14.3, null)).toBe('14.3 m')
  })
})

describe('buildOverlayLines', () => {
  const ts = new Date('2025-04-21T14:32:07Z').getTime()

  it('returns coords line when GPS available', () => {
    const lines = buildOverlayLines(52.36, 5.12, 12, null, null, ts, '', {
      showAccuracy: true, showAltitude: false, showTimestamp: false, showDescription: false,
    })
    expect(lines[0]).toContain('N')
    expect(lines[0]).toContain('±12 m')
    expect(lines.length).toBe(1)
  })

  it('shows "No GPS fix" when lat is null', () => {
    const lines = buildOverlayLines(null, null, null, null, null, ts, '', {
      showAccuracy: false, showAltitude: false, showTimestamp: false, showDescription: false,
    })
    expect(lines[0]).toBe('No GPS fix')
  })

  it('appends description when enabled and non-empty', () => {
    const lines = buildOverlayLines(52.36, 5.12, 12, null, null, ts, 'Test spot', {
      showAccuracy: false, showAltitude: false, showTimestamp: false, showDescription: true,
    })
    expect(lines[lines.length - 1]).toBe('Test spot')
  })

  it('skips description when disabled', () => {
    const lines = buildOverlayLines(52.36, 5.12, 12, null, null, ts, 'Test spot', {
      showAccuracy: false, showAltitude: false, showTimestamp: false, showDescription: false,
    })
    expect(lines.every(l => !l.includes('Test spot'))).toBe(true)
  })

  it('includes altitude when enabled', () => {
    const lines = buildOverlayLines(52.36, 5.12, 12, 14.3, 2, ts, '', {
      showAccuracy: false, showAltitude: true, showTimestamp: false, showDescription: false,
    })
    expect(lines.some(l => l.includes('14.3 m'))).toBe(true)
  })
})
