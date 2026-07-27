import { describe, it, expect, vi } from 'vitest'
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
