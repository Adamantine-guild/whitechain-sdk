import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Provider, createProvider } from '../src/network/provider.js'
import { whitechainTestnet } from '../src/config/networks.js'

describe('Provider Exponential Backoff & 429 Retry', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('emits rateLimit event, retries with exponential backoff on 429, and succeeds on subsequent 200', async () => {
    const provider = new Provider(whitechainTestnet, { maxRetries: 3, baseDelayMs: 10 })
    let callCount = 0

    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount <= 2) {
        return new Response('Too Many Requests', { status: 429 })
      }
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    globalThis.fetch = mockFetch

    const rateLimitListener = vi.fn()
    provider.on('rateLimit', rateLimitListener)

    const transportConfig = provider.transport({ chain: undefined, retryCount: 0 })
    const request = transportConfig.request

    const response = await request({ method: 'eth_blockNumber', params: [] })

    expect(callCount).toBe(3) // 2 retries (429) + 1 success (200)
    expect(rateLimitListener).toHaveBeenCalledTimes(2)
    expect(response).toBe('0x123')
  })

  it('stops retrying when maxRetries is reached and rejects', async () => {
    const provider = createProvider(whitechainTestnet, { maxRetries: 2, baseDelayMs: 10 })
    let callCount = 0

    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++
      return new Response('Too Many Requests', { status: 429 })
    })

    globalThis.fetch = mockFetch

    const rateLimitListener = vi.fn()
    provider.on('rateLimit', rateLimitListener)

    const transportConfig = provider.transport({ chain: undefined, retryCount: 0 })

    await expect(transportConfig.request({ method: 'eth_blockNumber', params: [] })).rejects.toThrow(
      'HTTP 429 Rate limit exceeded after 2 retries'
    )

    expect(callCount).toBe(3) // Initial call + 2 retries = 3 total calls
    expect(rateLimitListener).toHaveBeenCalledTimes(3)
  })

  it('polls for a transaction receipt until it is available', async () => {
    const provider = new Provider(whitechainTestnet)
    const receipt = { transactionHash: '0xabc', status: '0x1' }
    let callCount = 0

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: callCount === 1 ? null : receipt,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    const result = await provider.waitForTransaction('0xabc', { intervalMs: 1 })

    expect(result).toEqual(receipt)
    expect(callCount).toBe(2)
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      whitechainTestnet.rpcUrl,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('eth_getTransactionReceipt'),
      }),
    )
  })
})
