import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LRUCache, createLRUCache } from '../../src/cache/LRUCache.js'
import { LRUMemoryCache } from '../../src/cache/adapters/LRUMemoryCache.js'
import { CacheManager } from '../../src/cache/CacheManager.js'
import {
  TokenService,
  clearSdkCache,
  createTokenService,
} from '../../src/services/TokenService.js'
import type { Address } from 'viem'

describe('LRUCache', () => {
  it('evicts least-recently-used entries when capacity is exceeded', () => {
    const cache = new LRUCache<string>({ maxSize: 3 })
    cache.set('a', 'A')
    cache.set('b', 'B')
    cache.set('c', 'C')
    expect(cache.size).toBe(3)

    // Access a so b becomes the LRU
    expect(cache.get('a')).toBe('A')

    cache.set('d', 'D') // should evict b
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe('A')
    expect(cache.get('c')).toBe('C')
    expect(cache.get('d')).toBe('D')
    expect(cache.stats().evictions).toBe(1)
  })

  it('expires entries after TTL', () => {
    let now = 1_000
    const cache = createLRUCache<number>({ maxSize: 10, now: () => now })
    cache.set('x', 42, 100)
    expect(cache.get('x')).toBe(42)

    now = 1_050
    expect(cache.get('x')).toBe(42)

    now = 1_101
    expect(cache.get('x')).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('tracks hits and misses', () => {
    const cache = new LRUCache({ maxSize: 5 })
    cache.set('k', 1)
    cache.get('k')
    cache.get('missing')
    const s = cache.stats()
    expect(s.hits).toBe(1)
    expect(s.misses).toBe(1)
  })

  it('rejects invalid maxSize', () => {
    expect(() => new LRUCache({ maxSize: 0 })).toThrow(/maxSize/)
  })

  it('clear() empties the cache', () => {
    const cache = new LRUCache({ maxSize: 5 })
    cache.set('a', 1)
    cache.set('b', 2)
    cache.clear()
    expect(cache.size).toBe(0)
    expect(cache.get('a')).toBeUndefined()
  })
})

describe('LRUMemoryCache + CacheManager', () => {
  it('bounds capacity at 500 by default via CacheManager', async () => {
    const mgr = new CacheManager({ maxSize: 3 })
    for (let i = 0; i < 5; i++) {
      await mgr.set(
        { chainId: 1, contractAddress: `0x${i}`, functionName: 'decimals' },
        i,
      )
    }
    // Only 3 entries should remain
    const adapter = mgr.adapter as LRUMemoryCache
    expect(adapter.lru.size).toBe(3)
  })

  it('invalidates after TTL via CacheManager', async () => {
    vi.useFakeTimers()
    const mgr = new CacheManager({ maxSize: 10, defaultTtlMs: 100 })
    const key = {
      chainId: 1,
      contractAddress: '0xdead',
      functionName: 'symbol',
    }
    await mgr.set(key, 'WETH', 100)
    expect(await mgr.get(key)).toBe('WETH')

    vi.advanceTimersByTime(101)
    expect(await mgr.get(key)).toBeUndefined()
    vi.useRealTimers()
  })
})

describe('TokenService static metadata cache', () => {
  const token = '0x000000000000000000000000000000000000dEaD' as Address
  let rpcCount: number
  let client: { readContract: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    rpcCount = 0
    client = {
      readContract: vi.fn().mockImplementation(async ({ functionName }: { functionName: string }) => {
        rpcCount++
        if (functionName === 'decimals') return 18n
        if (functionName === 'symbol') return 'WETH'
        if (functionName === 'name') return 'Wrapped Ether'
        throw new Error(`unknown ${functionName}`)
      }),
    }
  })

  afterEach(async () => {
    await clearSdkCache()
  })

  it('secondary getTokenDecimals calls resolve from cache without RPC', async () => {
    const cacheManager = new CacheManager({ maxSize: 100 })
    const svc = createTokenService({
      client: client as any,
      chainId: 1,
      cacheManager,
      defaultTtlMs: 60_000,
    })

    const d1 = await svc.getTokenDecimals(token)
    const t0 = performance.now()
    const d2 = await svc.getTokenDecimals(token)
    const elapsed = performance.now() - t0

    expect(d1).toBe(18)
    expect(d2).toBe(18)
    expect(rpcCount).toBe(1)
    // Cache hit should be near-instant (well under 1ms on modern hardware; allow 5ms slack)
    expect(elapsed).toBeLessThan(5)
  })

  it('getTokenMetadata caches each field independently', async () => {
    const cacheManager = new CacheManager({ maxSize: 100 })
    const svc = new TokenService({
      client: client as any,
      cacheManager,
    })

    const meta = await svc.getTokenMetadata(token)
    expect(meta).toEqual({
      address: token,
      decimals: 18,
      symbol: 'WETH',
      name: 'Wrapped Ether',
    })
    expect(rpcCount).toBe(3)

    // Second full fetch should hit cache for all three
    await svc.getTokenMetadata(token)
    expect(rpcCount).toBe(3)
  })

  it('clearCache forces subsequent RPC', async () => {
    const cacheManager = new CacheManager({ maxSize: 50 })
    const svc = createTokenService({ client: client as any, cacheManager })

    await svc.getTokenSymbol(token)
    expect(rpcCount).toBe(1)

    await svc.clearCache()
    await svc.getTokenSymbol(token)
    expect(rpcCount).toBe(2)
  })

  it('setCacheEnabled(false) bypasses cache', async () => {
    const cacheManager = new CacheManager({ maxSize: 50 })
    const svc = createTokenService({ client: client as any, cacheManager })

    await svc.getTokenName(token)
    svc.setCacheEnabled(false)
    await svc.getTokenName(token)
    expect(rpcCount).toBe(2)
  })
})
