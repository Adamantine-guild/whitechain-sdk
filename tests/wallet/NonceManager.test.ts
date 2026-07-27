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
  })
})
