import { describe, it, expect } from 'vitest'
import { hashCode, verifyCode, encodePattern, hashPattern, verifyPattern } from '../../../src/core/crypto/index'

describe('hashCode', () => {
  it('produces a 64-char hex string', async () => {
    const h = await hashCode('1234')
    expect(h).toHaveLength(64)
    expect(/^[0-9a-f]+$/.test(h)).toBe(true)
  })

  it('is deterministic', async () => {
    const h1 = await hashCode('test')
    const h2 = await hashCode('test')
    expect(h1).toBe(h2)
  })

  it('differs for different inputs', async () => {
    const h1 = await hashCode('1234')
    const h2 = await hashCode('1235')
    expect(h1).not.toBe(h2)
  })
})

describe('verifyCode', () => {
  it('returns true for correct input', async () => {
    const hash = await hashCode('5678')
    expect(await verifyCode('5678', hash)).toBe(true)
  })

  it('returns false for wrong input', async () => {
    const hash = await hashCode('5678')
    expect(await verifyCode('9999', hash)).toBe(false)
  })

  it('returns false when storedHash is empty', async () => {
    expect(await verifyCode('anything', '')).toBe(false)
  })
})

describe('encodePattern', () => {
  it('joins positions with dashes', () => {
    expect(encodePattern([0, 1, 4, 7])).toBe('0-1-4-7')
  })

  it('handles single node', () => {
    expect(encodePattern([5])).toBe('5')
  })
})

describe('hashPattern / verifyPattern', () => {
  it('verifies a matching pattern', async () => {
    const positions = [0, 1, 2, 5, 8]
    const hash = await hashPattern(positions)
    expect(await verifyPattern(positions, hash)).toBe(true)
  })

  it('rejects a different pattern', async () => {
    const hash = await hashPattern([0, 1, 2])
    expect(await verifyPattern([0, 1, 3], hash)).toBe(false)
  })

  it('rejects reversed pattern', async () => {
    const hash = await hashPattern([0, 1, 2])
    expect(await verifyPattern([2, 1, 0], hash)).toBe(false)
  })
})
