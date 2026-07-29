import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AbiCache } from '../../src/core/AbiCache.js'
import type { Abi } from 'viem'

const mockAbi: Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
]

const anotherAbi: Abi = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
]

describe('AbiCache', () => {
  let cache: AbiCache

  beforeEach(() => {
    cache = new AbiCache({ maxSize: 3, ttlMs: 1000 })
  })

  describe('basic caching', () => {
    it('calls fetchFn on first access (cache miss)', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockAbi)
      await cache.get('0xABC', fetchFn)
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    it('returns from cache on second call without calling fetchFn again', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockAbi)
      const first = await cache.get('0xABC', fetchFn)
      const second = await cache.get('0xABC', fetchFn)
      expect(fetchFn).toHaveBeenCalledTimes(1)
      expect(first).toBe(second)
    })

    it('returns the correct ABI', async () => {
      const result = await cache.get('0xABC', async () => mockAbi)
      expect(result).toBe(mockAbi)
    })

    it('has() returns true for a fresh cached entry', async () => {
      await cache.get('0xABC', async () => mockAbi)
      expect(cache.has('0xABC')).toBe(true)
    })

    it('has() returns false for an uncached key', () => {
      expect(cache.has('0xDEAD')).toBe(false)
    })

    it('size reflects cached entries', async () => {
      expect(cache.size).toBe(0)
      await cache.get('0xA', async () => mockAbi)
      await cache.get('0xB', async () => anotherAbi)
      expect(cache.size).toBe(2)
    })
  })

  describe('TTL invalidation', () => {
    it('re-fetches after TTL expires', async () => {
      const shortCache = new AbiCache({ ttlMs: 50 })
      const fetchFn = vi.fn().mockResolvedValue(mockAbi)

      await shortCache.get('0xABC', fetchFn)
      expect(fetchFn).toHaveBeenCalledTimes(1)

      // Wait for TTL to expire
      await new Promise(r => setTimeout(r, 60))

      await shortCache.get('0xABC', fetchFn)
      expect(fetchFn).toHaveBeenCalledTimes(2)
    })

    it('has() returns false for an expired entry', async () => {
      const shortCache = new AbiCache({ ttlMs: 50 })
      await shortCache.get('0xABC', async () => mockAbi)
      await new Promise(r => setTimeout(r, 60))
      expect(shortCache.has('0xABC')).toBe(false)
    })
  })

  describe('LRU eviction', () => {
    it('evicts the least-recently-used entry when maxSize is exceeded', async () => {
      // Fill cache: A, B, C (maxSize=3)
      await cache.get('0xA', async () => mockAbi)
      await cache.get('0xB', async () => mockAbi)
      await cache.get('0xC', async () => mockAbi)
      expect(cache.size).toBe(3)

      // Adding 0xD should evict 0xA (LRU)
      await cache.get('0xD', async () => anotherAbi)
      expect(cache.size).toBe(3)
      expect(cache.has('0xA')).toBe(false)
      expect(cache.has('0xD')).toBe(true)
    })

    it('accessing a key refreshes its LRU position', async () => {
      await cache.get('0xA', async () => mockAbi)
      await cache.get('0xB', async () => mockAbi)
      await cache.get('0xC', async () => mockAbi)

      // Access 0xA to make it recently used
      await cache.get('0xA', async () => mockAbi)

      // Adding 0xD should evict 0xB now (LRU), not 0xA
      await cache.get('0xD', async () => anotherAbi)
      expect(cache.has('0xA')).toBe(true)
      expect(cache.has('0xB')).toBe(false)
    })
  })

  describe('invalidation', () => {
    it('invalidate() removes a specific entry', async () => {
      await cache.get('0xABC', async () => mockAbi)
      expect(cache.has('0xABC')).toBe(true)
      cache.invalidate('0xABC')
      expect(cache.has('0xABC')).toBe(false)
    })

    it('re-fetches after manual invalidate()', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockAbi)
      await cache.get('0xABC', fetchFn)
      cache.invalidate('0xABC')
      await cache.get('0xABC', fetchFn)
      expect(fetchFn).toHaveBeenCalledTimes(2)
    })

    it('clear() removes all entries', async () => {
      await cache.get('0xA', async () => mockAbi)
      await cache.get('0xB', async () => anotherAbi)
      cache.clear()
      expect(cache.size).toBe(0)
      expect(cache.has('0xA')).toBe(false)
      expect(cache.has('0xB')).toBe(false)
    })
  })

  describe('configuration', () => {
    it('respects custom maxSize', () => {
      const c = new AbiCache({ maxSize: 100 })
      expect(c.maxSize).toBe(100)
    })

    it('respects custom ttlMs', () => {
      const c = new AbiCache({ ttlMs: 99999 })
      expect(c.ttlMs).toBe(99999)
    })

    it('uses defaults when no options given', () => {
      const c = new AbiCache()
      expect(c.maxSize).toBe(50)
      expect(c.ttlMs).toBe(5 * 60 * 1000)
    })
  })
})
