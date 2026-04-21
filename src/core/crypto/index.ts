// =============================================================================
// Crypto — PIN and pattern hashing via SubtleCrypto (no external deps)
// =============================================================================

/**
 * Hash a string using SHA-256 via Web Crypto API.
 * Returns hex string (64 chars).
 */
export async function hashCode(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Verify a plaintext input against a stored SHA-256 hex hash.
 */
export async function verifyCode(input: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false
  const hash = await hashCode(input)
  return hash === storedHash
}

/**
 * Encode a pattern (sequence of 0-8 grid positions) into a string for hashing.
 * Example: [0, 1, 4, 7] → "0-1-4-7"
 */
export function encodePattern(positions: number[]): string {
  return positions.join('-')
}

/**
 * Hash a pattern for storage.
 */
export async function hashPattern(positions: number[]): Promise<string> {
  return hashCode(encodePattern(positions))
}

/**
 * Verify a drawn pattern against a stored hash.
 */
export async function verifyPattern(positions: number[], storedHash: string): Promise<boolean> {
  return verifyCode(encodePattern(positions), storedHash)
}
