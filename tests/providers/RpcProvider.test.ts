import { describe, it, expect, vi } from 'vitest'
import { ContractRevertError, RpcProvider, createRpcProvider, createWhiteChainClient } from '../../src/index.js'
import type { Address } from 'viem'

describe('RpcProvider', () => {
  it('retries transient 429 and 503 errors with exponential backoff and succeeds on 200', async () => {
    let callCount = 0
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) return new Response('Rate Limit', { status: 429 })
      if (callCount === 2) return new Response('Service Unavailable', { status: 503 })
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x1234' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const provider = new RpcProvider({
      url: 'https://rpc.whitechain.io',
      maxRetries: 3,
      initialDelayMs: 10,
      fetchFn: mockFetch,
    })

    const result = await provider.request<string>('eth_blockNumber')

    expect(result).toBe('0x1234')
    expect(callCount).toBe(3) // 2 retries (429, 503) + 1 success (200)
  })

  it('fails immediately without retrying on contract reverts', async () => {
    let callCount = 0
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32000, message: 'execution reverted: Insufficient balance' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    })

    const provider = new RpcProvider({
      url: 'https://rpc.whitechain.io',
      maxRetries: 3,
      initialDelayMs: 10,
      fetchFn: mockFetch,
    })

    await expect(provider.request('eth_call', [])).rejects.toThrow(ContractRevertError)
    expect(callCount).toBe(1) // Immediate failure, 0 retries
  })

  it('exposes revert metadata for typed handling', async () => {
    const revertData = '0x08c379a0'
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: -32000,
            message: 'execution reverted: Insufficient balance',
            data: revertData,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const provider = new RpcProvider({
      url: 'https://rpc.whitechain.io',
      maxRetries: 3,
      initialDelayMs: 10,
      fetchFn: mockFetch,
    })

    try {
      await provider.request('eth_call', [])
      expect.fail('Expected request to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(ContractRevertError)
      const revert = error as ContractRevertError
      expect(revert.reason).toBe('Insufficient balance')
      expect(revert.rawData).toBe(revertData)
      expect(revert.rpcCode).toBe(-32000)
      expect(revert.message).toContain('execution reverted: Insufficient balance')
    }

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry eth_sendRawTransaction to prevent double submission to mempool', async () => {
    let callCount = 0
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++
      return new Response('Gateway Timeout', { status: 504 })
    })

    const provider = new RpcProvider({
      url: 'https://rpc.whitechain.io',
      maxRetries: 3,
      initialDelayMs: 10,
      fetchFn: mockFetch,
    })

    await expect(provider.request('eth_sendRawTransaction', ['0x123456'])).rejects.toThrow()
    expect(callCount).toBe(1) // Never retries signed transactions!
  })

  it('integrates cleanly with createWhiteChainClient via toTransport()', async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const provider = createRpcProvider({
      url: 'https://rpc.whitechain.io',
      fetchFn: mockFetch,
    })

    const client = createWhiteChainClient({
      chain: {} as any,
      transport: provider.toTransport(),
      addresses: { grant: '0x000000000000000000000000000000000000dEaD' as Address },
    })

    expect(client.publicClient).toBeDefined()
  })
})
