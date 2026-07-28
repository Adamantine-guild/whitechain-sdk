import { describe, it, expect } from 'vitest'
import { toChecksumAddress, isAddress, assertChecksumAddress } from '../../src/utils/address.js'
import { ValidationError } from '../../src/errors/index.js'

// EIP-55 reference vectors from the EIP specification
const VALID_CHECKSUMMED = [
  '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
  '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
  '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
  '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
]

describe('toChecksumAddress', () => {
  it('produces correct EIP-55 checksum for reference vectors', () => {
    for (const addr of VALID_CHECKSUMMED) {
      expect(toChecksumAddress(addr)).toBe(addr)
    }
  })

  it('checksums a lowercase address correctly', () => {
    const lower = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'
    expect(toChecksumAddress(lower)).toBe('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')
  })

  it('checksums an uppercase address correctly', () => {
    const upper = '0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED'
    expect(toChecksumAddress(upper)).toBe('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')
  })

  it('accepts input without 0x prefix', () => {
    const noPfx = '5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'
    expect(toChecksumAddress(noPfx)).toBe('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')
  })

  it('is idempotent — checksumming a checksummed address returns the same value', () => {
    const addr = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
    expect(toChecksumAddress(toChecksumAddress(addr))).toBe(addr)
  })

  it('throws ValidationError for a too-short address', () => {
    expect(() => toChecksumAddress('0xdeadbeef')).toThrow(ValidationError)
  })

  it('throws ValidationError for a non-hex address', () => {
    expect(() => toChecksumAddress('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG')).toThrow(ValidationError)
  })

  it('throws ValidationError for an empty string', () => {
    expect(() => toChecksumAddress('')).toThrow(ValidationError)
  })

  it('always prefixes output with 0x', () => {
    const result = toChecksumAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')
    expect(result.startsWith('0x')).toBe(true)
    expect(result).toHaveLength(42)
  })
})

describe('isAddress', () => {
  it('returns true for valid EIP-55 checksummed addresses', () => {
    for (const addr of VALID_CHECKSUMMED) {
      expect(isAddress(addr)).toBe(true)
    }
  })

  it('returns false for a bad checksum (wrong capitalisation)', () => {
    // Flip one character's case to corrupt the checksum
    const bad = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAEd' // 'D' → 'd' at end
    expect(isAddress(bad)).toBe(false)
  })

  it('returns false for a purely lowercase address (no checksum)', () => {
    expect(isAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')).toBe(false)
  })

  it('returns false for a purely uppercase address (no checksum)', () => {
    expect(isAddress('0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED')).toBe(false)
  })

  it('returns false for too-short input', () => {
    expect(isAddress('0xdeadbeef')).toBe(false)
  })

  it('returns false for missing 0x prefix', () => {
    expect(isAddress('5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isAddress('')).toBe(false)
  })

  it('returns false for non-hex characters', () => {
    expect(isAddress('0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ')).toBe(false)
  })
})

describe('assertChecksumAddress', () => {
  it('does not throw for a valid checksummed address', () => {
    expect(() =>
      assertChecksumAddress('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')
    ).not.toThrow()
  })

  it('throws ValidationError for an all-lowercase address', () => {
    expect(() =>
      assertChecksumAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')
    ).toThrow(ValidationError)
  })

  it('throws ValidationError for a bad checksum', () => {
    expect(() =>
      assertChecksumAddress('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAEd')
    ).toThrow(ValidationError)
  })

  it('includes the address name in the error message', () => {
    try {
      assertChecksumAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed', 'recipient')
      expect.fail('should have thrown')
    } catch (e) {
      expect(e instanceof ValidationError).toBe(true)
      expect((e as Error).message).toContain('recipient')
    }
  })

  it('includes the corrected checksum in the error message', () => {
    try {
      assertChecksumAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')
      expect.fail('should have thrown')
    } catch (e) {
      expect((e as Error).message).toContain('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')
    }
  })
})
