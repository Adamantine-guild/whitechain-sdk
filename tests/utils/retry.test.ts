import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  computeBackoffDelay,
  isRetryableError,
  isRetryableHttpStatus,
  withRetry,
  RetryExhaustedError,
} from '../../src/utils/retry.js'
import { RpcProvider } from '../../src/providers/RpcProvider.js'

describe('computeBackoffDelay', () => {
  it('grows exponentially without jitter and caps at maxDelay', () => {
    expect(computeBackoffDelay(0, { initialDelayMs: 500, maxDelayMs: 5000, jitter: 'none' })).toBe(
      500,
    )
    expect(computeBackoffDelay(1, { initialDelayMs: 500, maxDelayMs: 5000, jitter: 'none' })).toBe(
      1000,
    )
    expect(computeBackoffDelay(2, { initialDelayMs: 500, maxDelayMs: 5000, jitter: 'none' })).toBe(
      2000,
    )
    expect(computeBackoffDelay(3, { initialDelayMs: 500, maxDelayMs: 5000, jitter: 'none' })).toBe(
      4000,
    )
    expect(computeBackoffDelay(4, { initialDelayMs: 500, maxDelayMs: 5000, jitter: 'none' })).toBe(
      5000,
    )
    expect(computeBackoffDelay(10, { initialDelayMs: 500, maxDelayMs: 5000, jitter: 'none' })).toBe(
      5000,
    )
  })

  it('full jitter returns a value in [0, exp]', () => {
    const delays = Array.from({ length: 20 }, (_, i) =>
      computeBackoffDelay(2, {
        initialDelayMs: 500,
        maxDelayMs: 5000,
        jitter: 'full',
        randomFn: () => i / 20,
      }),
    )
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThanOrEqual(2000)
    }
    // Ensure randomness is actually applied (not all equal when randomFn varies)
    expect(new Set(delays).size).toBeGreaterThan(1)
  })

  it('equal jitter returns a value in [exp/2, exp]', () => {
    const d0 = computeBackoffDelay(1, {
      initialDelayMs: 500,
      maxDelayMs: 5000,
      jitter: 'equal',
      randomFn: () => 0,
    })
    const d1 = computeBackoffDelay(1, {
      initialDelayMs: 500,
      maxDelayMs: 5000,
      jitter: 'equal',
      randomFn: () => 1,
    })
    expect(d0).toBe(500) // half of 1000
    expect(d1).toBe(1000)
  })
})

describe('isRetryableError / isRetryableHttpStatus', () => {
  it('classifies transient HTTP statuses as retryable', () => {
    expect(isRetryableHttpStatus(429)).toBe(true)
    expect(isRetryableHttpStatus(503)).toBe(true)
    expect(isRetryableHttpStatus(502)).toBe(true)
    expect(isRetryableHttpStatus(504)).toBe(true)
    expect(isRetryableHttpStatus(408)).toBe(true)
    expect(isRetryableHttpStatus(400)).toBe(false)
    expect(isRetryableHttpStatus(404)).toBe(false)
    expect(isRetryableHttpStatus(200)).toBe(false)
  })

  it('classifies network errors as retryable and reverts as not', () => {
    expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true)
    expect(isRetryableError({ message: 'fetch failed' })).toBe(true)
    expect(isRetryableError({ status: 429 })).toBe(true)
    expect(isRetryableError({ message: 'execution reverted: no' })).toBe(false)
    expect(isRetryableError({ message: 'invalid signature' })).toBe(false)
    expect(isRetryableError({ message: 'method not found' })).toBe(false)
    expect(isRetryableError({ retryable: false, status: 503 })).toBe(false)
  })
})

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries retryable failures with growing delays then succeeds', async () => {
    const sleeps: number[] = []
    let calls = 0
    const fn = vi.fn(async () => {
      calls++
      if (calls < 3) {
        const err: any = new Error('ECONNRESET')
        err.code = 'ECONNRESET'
        throw err
      }
      return 'ok'
    })

    const promise = withRetry(fn, {
      maxRetries: 3,
      initialDelayMs: 500,
      maxDelayMs: 5000,
      jitter: 'none',
      sleepFn: async (ms) => {
        sleeps.push(ms)
      },
    })

    // withRetry awaits sleepFn which we resolve immediately
    const result = await promise
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
    expect(sleeps).toEqual([500, 1000])
  })

  it('does not retry unrecoverable errors', async () => {
    const fn = vi.fn(async () => {
      throw new Error('execution reverted: boom')
    })

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        sleepFn: async () => {},
      }),
    ).rejects.toThrow(/execution reverted/)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('throws RetryExhaustedError after maxRetries', async () => {
    const fn = vi.fn(async () => {
      const err: any = new Error('timeout')
      err.code = 'ETIMEDOUT'
      throw err
    })

    await expect(
      withRetry(fn, {
        maxRetries: 2,
        jitter: 'none',
        initialDelayMs: 10,
        sleepFn: async () => {},
      }),
    ).rejects.toBeInstanceOf(RetryExhaustedError)

    expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
  })
})

describe('RpcProvider backoff integration', () => {
  it('uses computeBackoffDelay with maxDelay and jitter hooks', async () => {
    let callCount = 0
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount <= 2) return new Response('Rate Limit', { status: 429, statusText: 'Too Many Requests' })
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const sleeps: number[] = []
    const provider = new RpcProvider({
      url: 'https://rpc.example',
      maxRetries: 3,
      initialDelayMs: 500,
      maxDelayMs: 5000,
      jitter: 'none',
      fetchFn: mockFetch,
    })
    provider.setRetryHooks({
      sleepFn: async (ms) => {
        sleeps.push(ms)
      },
    })

    const result = await provider.request<string>('eth_blockNumber')
    expect(result).toBe('0x1')
    expect(callCount).toBe(3)
    expect(sleeps).toEqual([500, 1000])
  })

  it('fails fast on non-retryable JSON-RPC method errors', async () => {
    let callCount = 0
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32601, message: 'the method eth_foo does not exist/is not available' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })

    const provider = new RpcProvider({
      url: 'https://rpc.example',
      maxRetries: 3,
      initialDelayMs: 10,
      jitter: 'none',
      fetchFn: mockFetch,
    })
    provider.setRetryHooks({ sleepFn: async () => {} })

    await expect(provider.request('eth_foo')).rejects.toThrow(/JSON-RPC Error/)
    expect(callCount).toBe(1)
  })
})
