import { describe, it, expect, vi } from 'vitest'
import { BatchProvider, MulticallProvider } from '../src/network/BatchProvider.js'
import { networks } from '../src/config/networks.js'

describe('BatchProvider / MulticallProvider', () => {
  it('bundles 10 concurrent balanceOf() calls into exactly 1 HTTP request within a 50ms tick', async () => {
    let httpCallCount = 0
    let lastRequestBody: any = null

    const mockFetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      httpCallCount++
      lastRequestBody = JSON.parse(init?.body as string)

      // Generate 10 batch responses matching each request ID
      const responses = (lastRequestBody as any[]).map((req) => ({
        jsonrpc: '2.0',
        id: req.id,
        result: '0x0000000000000000000000000000000000000000000000000de0b6b3a7640000', // 1 ETH in wei hex
      }))

      return {
        ok: true,
        status: 200,
        json: async () => responses,
      } as Response
    })

    const provider = new BatchProvider({
      rpcUrl: 'https://rpc.whitechain.io',
      waitMs: 50,
      fetchFn: mockFetch,
    })

    const tokenAddress = '0x1111111111111111111111111111111111111111'
    const userAddresses = Array.from({ length: 10 }, (_, i) =>
      `0x${(i + 1).toString(16).padStart(40, '0')}`
    )

    // Trigger 10 balanceOf calls concurrently in the same tick
    const promises = userAddresses.map((user) => provider.balanceOf(tokenAddress, user))

    const results = await Promise.all(promises)

    // Verify exactly 1 HTTP request was made
    expect(httpCallCount).toBe(1)
    expect(Array.isArray(lastRequestBody)).toBe(true)
    expect(lastRequestBody.length).toBe(10)
    expect(results.length).toBe(10)
    results.forEach((res) => {
      expect(res).toBe('0x0000000000000000000000000000000000000000000000000de0b6b3a7640000')
    })
  })

  it('correlates responses by request ID so a single failed call does not affect other calls', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const requests = JSON.parse(init?.body as string) as any[]

      // Make request with ID = 2 fail with a JSON-RPC error, while IDs 1 and 3 succeed
      const responses = requests.map((req) => {
        if (req.id === 2) {
          return {
            jsonrpc: '2.0',
            id: req.id,
            error: { code: -32602, message: 'Invalid params for call 2' },
          }
        }
        return {
          jsonrpc: '2.0',
          id: req.id,
          result: `0xResult_${req.id}`,
        }
      })

      return {
        ok: true,
        status: 200,
        json: async () => responses,
      } as Response
    })

    const provider = new BatchProvider({
      rpcUrl: 'https://rpc.sepolia.org',
      waitMs: 50,
      fetchFn: mockFetch,
    })

    const req1 = provider.request('eth_blockNumber')
    const req2 = provider.request('eth_getBalance', ['0xBadAddress'])
    const req3 = provider.request('eth_gasPrice')

    // Call 1 should succeed
    await expect(req1).resolves.toBe('0xResult_1')

    // Call 2 should reject with JSON-RPC error
    await expect(req2).rejects.toThrow('JSON-RPC Error [-32602]: Invalid params for call 2')

    // Call 3 should succeed independently of Call 2's failure
    await expect(req3).resolves.toBe('0xResult_3')
  })

  it('rejects all queued calls if the HTTP request returns a non-200 status code', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response)

    const provider = new BatchProvider({
      network: networks.sepolia,
      waitMs: 20,
      fetchFn: mockFetch,
    })

    const p1 = provider.request('eth_blockNumber')
    const p2 = provider.request('eth_chainId')

    await expect(p1).rejects.toThrow('HTTP Error 500: Internal Server Error')
    await expect(p2).rejects.toThrow('HTTP Error 500: Internal Server Error')
  })

  it('supports MulticallProvider alias and manual flush()', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const requests = JSON.parse(init?.body as string) as any[]
      return {
        ok: true,
        status: 200,
        json: async () => requests.map((r) => ({ jsonrpc: '2.0', id: r.id, result: '0x123' })),
      } as Response
    })

    const provider = new MulticallProvider({
      rpcUrl: 'https://rpc.whitechain.io',
      waitMs: 1000, // long wait
      fetchFn: mockFetch,
    })

    const p1 = provider.request('eth_blockNumber')
    
    // Manually flush immediately without waiting 1000ms
    await provider.flush()

    const res = await p1
    expect(res).toBe('0x123')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
