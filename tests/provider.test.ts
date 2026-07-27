import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Provider } from '../src/network/provider.js'
import { whitechainTestnet } from '../src/config/networks.js'

describe('Provider', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('emits rateLimit event on 429 response and continues', async () => {
    const provider = new Provider(whitechainTestnet)
    let callCount = 0

    // Mock fetch to return 429 on first call, 200 on second call
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return new Response('Too Many Requests', { status: 429 })
      }
      return new Response(JSON.stringify({ result: 'success' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    const rateLimitListener = vi.fn()
    provider.on('rateLimit', rateLimitListener)

    // Call the viem transport directly to simulate a request.
    // Viem's http transport wraps our custom fetch and handles exponential backoff.
    // The transport function returns a function when called with an RPC URL, but in Viem's `Transport` type it's an object with a `request` method if initialized by a client,
    // or it's a function that takes `{ chain }` and returns `{ request }`.
    
    // We can just invoke our custom fetch via the fetchOptions injected by `http()` transport?
    // Wait, the easiest way to test this without instantiating a whole viem client is to just call `transport` function.
    // Viem's http() returns a Transport function: `(config) => TransportConfig`
    const transportConfig = provider.transport({ chain: undefined })
    const request = transportConfig.request
    
    // We simulate a basic RPC request
    const response = await request({ method: 'eth_blockNumber', params: [] })

    expect(callCount).toBe(2)
    expect(rateLimitListener).toHaveBeenCalledTimes(1)
    expect(response).toBe('success')
  })
})
