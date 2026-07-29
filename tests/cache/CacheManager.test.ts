import { describe, it, expect, vi } from 'vitest'
import { CacheManager } from '../../src/cache/CacheManager.js'
import { MemoryCache } from '../../src/cache/adapters/MemoryCache.js'
import { IndexedDBCache } from '../../src/cache/adapters/IndexedDBCache.js'
import { ContractWrapper } from '../../src/core/ContractWrapper.js'
import type { Address } from 'viem'

describe('SDK Caching Layer & CacheManager', () => {
  it('requesting token decimals 10 times in a row results in exactly 1 RPC request', async () => {
    let rpcCount = 0
    const mockClient = {
      readContract: vi.fn().mockImplementation(async () => {
        rpcCount++
        return 18n
      }),
    }

    const cacheManager = new CacheManager({ enabled: true })
    const contract = new ContractWrapper({
      address: '0x000000000000000000000000000000000000dEaD' as Address,
      abi: [],
      client: mockClient as any,
      chainId: 1,
      cacheManager,
    })

    // Execute read 10 times consecutively
    const results = await Promise.all(
      Array.from({ length: 10 }).map(() => contract.read<bigint>('decimals'))
    )

    expect(results).toEqual(Array(10).fill(18n))
    expect(rpcCount).toBe(1) // Exactly 1 RPC request!
  })

  it('allows manual cache invalidation via cacheManager.clear()', async () => {
    let rpcCount = 0
    const mockClient = {
      readContract: vi.fn().mockImplementation(async () => {
        rpcCount++
        return 'Wrapped Ether'
      }),
    }

    const cacheManager = new CacheManager({ enabled: true })
    const contract = new ContractWrapper({
      address: '0x000000000000000000000000000000000000dEaD' as Address,
      abi: [],
      client: mockClient as any,
      chainId: 1,
      cacheManager,
    })

    await contract.read('name')
    expect(rpcCount).toBe(1)

    // Manual cache clear
    await cacheManager.clear()

    await contract.read('name')
    expect(rpcCount).toBe(2) // New RPC request after clear()
  })

  it('allows opt-out per call using useCache: false', async () => {
    let rpcCount = 0
    const mockClient = {
      readContract: vi.fn().mockImplementation(async () => {
        rpcCount++
        return 100n
      }),
    }

    const contract = new ContractWrapper({
      address: '0x000000000000000000000000000000000000dEaD' as Address,
      abi: [],
      client: mockClient as any,
      chainId: 1,
    })

    await contract.read('balanceOf', ['0x123'], { useCache: false })
    await contract.read('balanceOf', ['0x123'], { useCache: false })

    expect(rpcCount).toBe(2) // Bypassed cache both times
  })

  it('supports MemoryCache and IndexedDBCache adapters with TTL expiration', async () => {
    const memoryCache = new MemoryCache()
    await memoryCache.set('key1', 'value1', { ttlMs: 10 })

    let entry = await memoryCache.get('key1')
    expect(entry?.value).toBe('value1')

    // Wait for TTL expiration
    await new Promise((resolve) => setTimeout(resolve, 20))
    entry = await memoryCache.get('key1')
    expect(entry).toBeUndefined()

    const indexedDbCache = new IndexedDBCache()
    await indexedDbCache.set('key2', 'value2')
    const entry2 = await indexedDbCache.get('key2')
    expect(entry2?.value).toBe('value2')
  })
})
