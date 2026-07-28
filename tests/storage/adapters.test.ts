import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PinataAdapter, NFTStorageAdapter } from '../../src/storage/adapters/index.js'
import { RpcError } from '../../src/errors/index.js'

describe('IPFS Adapters', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.clearAllMocks()
  })

  describe('PinataAdapter', () => {
    it('uploadJSON works and formats return value', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ IpfsHash: 'QmTestPinataJSON' }),
      })
      globalThis.fetch = mockFetch

      const adapter = new PinataAdapter('test-jwt')
      const result = await adapter.uploadJSON({ test: 123 })

      expect(result).toBe('ipfs://QmTestPinataJSON')
      expect(mockFetch).toHaveBeenCalledWith('https://api.pinata.cloud/pinning/pinJSONToIPFS', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-jwt',
          'Content-Type': 'application/json',
        }),
      }))
    })

    it('uploadFile works and handles FormData', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ IpfsHash: 'QmTestPinataFile' }),
      })
      globalThis.fetch = mockFetch

      const adapter = new PinataAdapter('test-jwt')
      const result = await adapter.uploadFile(new Uint8Array([1, 2, 3]), 'hello.txt')

      expect(result).toBe('ipfs://QmTestPinataFile')
      expect(mockFetch).toHaveBeenCalledWith('https://api.pinata.cloud/pinning/pinFileToIPFS', expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-jwt',
        },
      }))
    })
  })

  describe('NFTStorageAdapter', () => {
    it('uploadJSON works and formats return value', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: { cid: 'QmTestNFTJSON' } }),
      })
      globalThis.fetch = mockFetch

      const adapter = new NFTStorageAdapter('test-api-key')
      const result = await adapter.uploadJSON({ test: 123 })

      expect(result).toBe('ipfs://QmTestNFTJSON')
      expect(mockFetch).toHaveBeenCalledWith('https://api.nft.storage/upload', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
        }),
      }))
    })

    it('uploadFile works with binary data', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: { cid: 'QmTestNFTFile' } }),
      })
      globalThis.fetch = mockFetch

      const adapter = new NFTStorageAdapter('test-api-key')
      const result = await adapter.uploadFile(new Uint8Array([1, 2, 3]))

      expect(result).toBe('ipfs://QmTestNFTFile')
      expect(mockFetch).toHaveBeenCalledWith('https://api.nft.storage/upload', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key',
        }),
      }))
    })
  })

  describe('Rate Limiting & Retries (utils)', () => {
    it('retries on 429 Too Many Requests', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ IpfsHash: 'QmSuccessAfterRetry' }),
        })
      
      globalThis.fetch = mockFetch

      // Override the timer so we don't actually wait 1 second during tests
      vi.useFakeTimers()

      const adapter = new PinataAdapter('test-jwt')
      
      const promise = adapter.uploadJSON({ test: 123 })
      
      // Advance timers to trigger the retry after backoff
      await vi.runAllTimersAsync()
      
      const result = await promise

      expect(result).toBe('ipfs://QmSuccessAfterRetry')
      expect(mockFetch).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })

    it('throws RpcError if a non-429 error occurs', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid API Key'),
      })
      globalThis.fetch = mockFetch

      const adapter = new PinataAdapter('test-jwt')
      
      await expect(adapter.uploadJSON({ test: 123 })).rejects.toThrowError(RpcError)
      await expect(adapter.uploadJSON({ test: 123 })).rejects.toThrow('HTTP Error: 401 Unauthorized')
      expect(mockFetch).toHaveBeenCalledTimes(2) // once per uploadJSON call
    })
  })
})
