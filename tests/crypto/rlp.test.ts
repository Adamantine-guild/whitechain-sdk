import { describe, it, expect } from 'vitest'
import { toHex, toRlp } from 'viem'
import { decodeAccount, decodeHexPrefix, keyToNibbles, TrieEncodingError } from '../../src/crypto/rlp.js'

describe('keyToNibbles', () => {
  it('splits each byte into high/low nibbles', () => {
    expect(keyToNibbles(new Uint8Array([0x1a, 0x2b]))).toEqual([1, 10, 2, 11])
  })

  it('returns an empty array for an empty key', () => {
    expect(keyToNibbles(new Uint8Array([]))).toEqual([])
  })

  it('handles a full 32-byte key as 64 nibbles', () => {
    const key = new Uint8Array(32).fill(0xff)
    const nibbles = keyToNibbles(key)
    expect(nibbles).toHaveLength(64)
    expect(nibbles.every((n) => n === 15)).toBe(true)
  })
})

describe('decodeHexPrefix', () => {
  it('decodes an even-length extension path (flag 0x0)', () => {
    const result = decodeHexPrefix(new Uint8Array([0x00, 0x12, 0x34]))
    expect(result).toEqual({ nibbles: [1, 2, 3, 4], isLeaf: false })
  })

  it('decodes an odd-length extension path (flag 0x1)', () => {
    // flag nibble = 1, first path nibble = 0xa, packed into byte 0x1a
    const result = decodeHexPrefix(new Uint8Array([0x1a, 0x23]))
    expect(result).toEqual({ nibbles: [0xa, 2, 3], isLeaf: false })
  })

  it('decodes an even-length leaf path (flag 0x2)', () => {
    const result = decodeHexPrefix(new Uint8Array([0x20, 0x12, 0x34]))
    expect(result).toEqual({ nibbles: [1, 2, 3, 4], isLeaf: true })
  })

  it('decodes an odd-length leaf path (flag 0x3)', () => {
    const result = decodeHexPrefix(new Uint8Array([0x3a]))
    expect(result).toEqual({ nibbles: [0xa], isLeaf: true })
  })

  it('rejects an empty input', () => {
    expect(() => decodeHexPrefix(new Uint8Array([]))).toThrow(TrieEncodingError)
  })

  it('rejects a flag nibble greater than 3', () => {
    expect(() => decodeHexPrefix(new Uint8Array([0x40, 0x12]))).toThrow(/invalid hex-prefix flag/)
  })

  it('rejects a non-zero padding nibble on an even-length path', () => {
    expect(() => decodeHexPrefix(new Uint8Array([0x05, 0x12]))).toThrow(/padding nibble/)
  })
})

describe('decodeAccount', () => {
  const nonce = 7n
  const balance = 123_456_789_000_000_000n
  const storageRoot = `0x${'11'.repeat(32)}` as const
  const codeHash = `0x${'22'.repeat(32)}` as const

  function encode(nonceVal: bigint, balanceVal: bigint): Uint8Array {
    const minimal = (v: bigint) => {
      if (v === 0n) return '0x'
      let hex = v.toString(16)
      if (hex.length % 2 === 1) hex = `0${hex}`
      return `0x${hex}` as const
    }
    return toRlp([minimal(nonceVal), minimal(balanceVal), storageRoot, codeHash], 'bytes')
  }

  it('decodes a well-formed 4-item account list', () => {
    const decoded = decodeAccount(encode(nonce, balance))
    expect(decoded).toEqual({ nonce, balance, storageRoot, codeHash })
  })

  it('decodes a zero nonce/balance (RLP empty-string encoding) as 0n', () => {
    const decoded = decodeAccount(encode(0n, 0n))
    expect(decoded.nonce).toBe(0n)
    expect(decoded.balance).toBe(0n)
  })

  it('rejects RLP that is not a list', () => {
    const notAList = toRlp(toHex(new Uint8Array([1, 2, 3])), 'bytes')
    expect(() => decodeAccount(notAList)).toThrow(TrieEncodingError)
  })

  it('rejects a list with the wrong number of items', () => {
    const threeItems = toRlp(['0x01', '0x02', '0x03'], 'bytes')
    expect(() => decodeAccount(threeItems)).toThrow(/4 items/)
  })

  it('rejects an account field that is itself a nested list', () => {
    const nestedField = toRlp([['0x01'], '0x02', storageRoot, codeHash], 'bytes')
    expect(() => decodeAccount(nestedField)).toThrow(/byte strings/)
  })
})
