import { describe, it, expect } from 'vitest'
import { verifyIntegrity } from '../../src/zk/integrity.js'

// Helper: compute SHA-256 of a buffer using the native crypto API
async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

describe('verifyIntegrity', () => {
  it('returns true for a correct hash', async () => {
    const buffer = new Uint8Array([1, 2, 3, 4, 5])
    const hash = await sha256Hex(buffer)
    const result = await verifyIntegrity(buffer, hash)
    expect(result).toBe(true)
  })

  it('accepts a hash with 0x prefix', async () => {
    const buffer = new Uint8Array([10, 20, 30])
    const hash = await sha256Hex(buffer)
    const result = await verifyIntegrity(buffer, `0x${hash}`)
    expect(result).toBe(true)
  })

  it('accepts a hash with uppercase letters', async () => {
    const buffer = new Uint8Array([99, 88, 77])
    const hash = await sha256Hex(buffer)
    const result = await verifyIntegrity(buffer, hash.toUpperCase())
    expect(result).toBe(true)
  })

  it('returns false for a tampered buffer', async () => {
    const buffer = new Uint8Array([1, 2, 3])
    const hash = await sha256Hex(buffer)
    const tampered = new Uint8Array([1, 2, 4]) // last byte changed
    const result = await verifyIntegrity(tampered, hash)
    expect(result).toBe(false)
  })

  it('returns false for a completely wrong hash', async () => {
    const buffer = new Uint8Array([1, 2, 3])
    const result = await verifyIntegrity(
      buffer,
      'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
    )
    expect(result).toBe(false)
  })

  it('verifies an empty buffer', async () => {
    const buffer = new Uint8Array([])
    const hash = await sha256Hex(buffer)
    const result = await verifyIntegrity(buffer, hash)
    expect(result).toBe(true)
  })
})
