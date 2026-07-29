import { describe, it, expect, vi } from 'vitest'
import {
  NonceManager,
  createNonceManager,
} from '../../src/wallet/NonceManager.js'
import { WhiteChainError } from '../../src/types.js'
import type { Address } from 'viem'

const dummyAddress = '0x1111111111111111111111111111111111111111' as Address

describe('NonceManager', () => {
  it('correctly assigns nonces N, N+1, N+2... for 10 concurrent async calls with initialNonce', async () => {
    const nonceManager = new NonceManager({
      address: dummyAddress,
      initialNonce: 10,
    })

    expect(nonceManager.isInitialized()).toBe(true)
    expect(nonceManager.getCachedNonce()).toBe(10)

    // Call getNextNonce() 10 times concurrently
    const noncePromises = Array.from({ length: 10 }, () => nonceManager.getNextNonce())
    const nonces = await Promise.all(noncePromises)

    // Should return nonces 10 to 19 strictly sequential and without collisions
    expect(nonces).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    expect(nonceManager.getCachedNonce()).toBe(20)
  })

  it('handles 10 concurrent sendTransaction calls with predicted nonces without collision', async () => {
    const nonceManager = createNonceManager({
      address: dummyAddress,
      initialNonce: 100,
    })

    const assignedNonces: number[] = []

    const sendFn = (nonce: number) => {
      assignedNonces.push(nonce)
      return Promise.resolve(`0xhash_${nonce}`)
    }

    // 10 asynchronous sendTransaction calls launched in parallel
    const txPromises = Array.from({ length: 10 }, () => nonceManager.sendTransaction(sendFn))
    const hashes = await Promise.all(txPromises)

    expect(hashes.length).toBe(10)
    expect(assignedNonces).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108, 109])
  })

  it('queues concurrent calls during initial RPC fetch and assigns sequential nonces', async () => {
    let rpcCallCount = 0

    // Simulate async RPC call delay
    const getOnChainNonce = vi.fn().mockImplementation(async () => {
      rpcCallCount++
      await new Promise((resolve) => setTimeout(resolve, 50))
      return 5
    })

    const nonceManager = new NonceManager({
      address: dummyAddress,
      getOnChainNonce,
    })

    expect(nonceManager.isInitialized()).toBe(false)
    expect(nonceManager.getCachedNonce()).toBe(null)

    // Launch 10 concurrent calls while uninitialized
    const noncePromises = Array.from({ length: 10 }, () => nonceManager.getNextNonce())
    const nonces = await Promise.all(noncePromises)

    // Only 1 RPC request should have been triggered
    expect(rpcCallCount).toBe(1)

    // All 10 callers should receive nonces 5 to 14
    expect(nonces).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
    expect(nonceManager.getCachedNonce()).toBe(15)
  })

  it('fetches on-chain nonce via publicClient if provided', async () => {
    const getTransactionCount = vi.fn().mockResolvedValue(42)
    const publicClient = { getTransactionCount } as any

    const nonceManager = new NonceManager({
      address: dummyAddress,
      publicClient,
    })

    const nonce1 = await nonceManager.getNextNonce()
    const nonce2 = await nonceManager.getNextNonce()

    expect(nonce1).toBe(42)
    expect(nonce2).toBe(43)
    expect(getTransactionCount).toHaveBeenCalledTimes(1)
    expect(getTransactionCount).toHaveBeenCalledWith({ address: dummyAddress, blockTag: 'pending' })
  })

  it('supports reset() to fall back to RPC on dropped transactions', async () => {
    let rpcNonce = 20
    const getOnChainNonce = vi.fn().mockImplementation(async () => rpcNonce)

    const nonceManager = new NonceManager({
      address: dummyAddress,
      getOnChainNonce,
    })

    const n1 = await nonceManager.getNextNonce()
    const n2 = await nonceManager.getNextNonce()
    expect(n1).toBe(20)
    expect(n2).toBe(21)
    expect(getOnChainNonce).toHaveBeenCalledTimes(1)

    // Simulate dropped tx: reset local state and update RPC on-chain nonce
    nonceManager.reset()
    expect(nonceManager.isInitialized()).toBe(false)
    expect(nonceManager.getCachedNonce()).toBe(null)

    rpcNonce = 20 // on-chain nonce remained 20 because tx dropped
    const n3 = await nonceManager.getNextNonce()
    expect(n3).toBe(20)
    expect(getOnChainNonce).toHaveBeenCalledTimes(2)
  })

  it('supports setNonce to manually override next nonce', () => {
    const nonceManager = new NonceManager({
      address: dummyAddress,
      initialNonce: 0,
    })

    nonceManager.setNonce(50)
    expect(nonceManager.getCachedNonce()).toBe(50)
  })

  it('supports getNextNonceBigInt', async () => {
    const nonceManager = new NonceManager({
      address: dummyAddress,
      initialNonce: 7,
    })

    const bigintNonce = await nonceManager.getNextNonceBigInt()
    expect(bigintNonce).toBe(7n)
    expect(typeof bigintNonce).toBe('bigint')
  })

  it('throws WhiteChainError if configured without publicClient or getOnChainNonce when fetching', async () => {
    const nonceManager = new NonceManager({
      address: dummyAddress,
    })

    await expect(nonceManager.getNextNonce()).rejects.toThrow(WhiteChainError)
  })

  it('throws WhiteChainError for invalid initial or manually set nonces', () => {
    expect(() => new NonceManager({ address: dummyAddress, initialNonce: -1 })).toThrow(WhiteChainError)
    expect(() => new NonceManager({ address: dummyAddress, initialNonce: 1.5 })).toThrow(WhiteChainError)

    const nm = new NonceManager({ address: dummyAddress, initialNonce: 0 })
    expect(() => nm.setNonce(-5)).toThrow(WhiteChainError)
    expect(() => nm.setNonce(3.14)).toThrow(WhiteChainError)
import { NonceManager } from '../../src/wallet/NonceManager.js'

describe('NonceManager', () => {
  it('fetches nonce on first call', async () => {
    const manager = new NonceManager()
    const fetchFn = vi.fn().mockResolvedValue(42)

    const nonce = await manager.getNonce('0x123', fetchFn)
    expect(nonce).toBe(42)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('increments cached nonce without fetching', async () => {
    const manager = new NonceManager()
    const fetchFn = vi.fn().mockResolvedValue(10)

    const nonce1 = await manager.getNonce('0xabc', fetchFn)
    const nonce2 = await manager.getNonce('0xabc', fetchFn)
    const nonce3 = await manager.getNonce('0xabc', fetchFn)

    expect(nonce1).toBe(10)
    expect(nonce2).toBe(11)
    expect(nonce3).toBe(12)
    expect(fetchFn).toHaveBeenCalledTimes(1) // Only fetched once
  })

  it('handles 10 concurrent requests cleanly without collisions', async () => {
    const manager = new NonceManager()
    
    // Introduce a delayed fetch to force all callers to wait on the same pending promise
    const fetchFn = vi.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
      return 100
    })

    // Fire 10 concurrent requests
    const promises = Array.from({ length: 10 }, () => manager.getNonce('0xdef', fetchFn))
    const nonces = await Promise.all(promises)

    // They should receive exactly 100 through 109
    const expected = Array.from({ length: 10 }, (_, i) => 100 + i)
    
    // Sort to verify the set of numbers is exactly what we expect (Promise.all preserves array order anyway)
    expect(nonces.sort((a, b) => a - b)).toEqual(expected)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('resets the cache and fetches again', async () => {
    const manager = new NonceManager()
    const fetchFn = vi.fn().mockResolvedValue(5)

    const nonce1 = await manager.getNonce('0x999', fetchFn)
    expect(nonce1).toBe(5)

    // Simulate dropped tx, manual reset
    manager.reset('0x999')
    
    // Mock the new RPC response
    fetchFn.mockResolvedValue(5) // RPC returns 5 again since it dropped

    const nonce2 = await manager.getNonce('0x999', fetchFn)
    expect(nonce2).toBe(5)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('handles errors from fetch gracefully', async () => {
    const manager = new NonceManager()
    let calls = 0
    const fetchFn = vi.fn().mockImplementation(async () => {
      calls++
      if (calls === 1) throw new Error('RPC Error')
      return 7
    })

    await expect(manager.getNonce('0x444', fetchFn)).rejects.toThrow('RPC Error')
    
    // The next call should retry since the pending fetch was deleted
    const nonce = await manager.getNonce('0x444', fetchFn)
    expect(nonce).toBe(7)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})
