import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IPFSClient } from '../../src/storage/IPFSClient.js'
import type { IPFSAdapter } from '../../src/storage/adapters/types.js'

const mockAdapter: IPFSAdapter = {
  uploadJSON: vi.fn().mockResolvedValue('ipfs://QmJSON'),
  uploadFile: vi.fn().mockResolvedValue('ipfs://QmFile'),
}

describe('IPFSClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates uploadJSON to adapter', async () => {
    const client = new IPFSClient(mockAdapter)
    const data = { hello: 'world' }
    const result = await client.uploadJSON(data)

    expect(mockAdapter.uploadJSON).toHaveBeenCalledWith(data)
    expect(result).toBe('ipfs://QmJSON')
  })

  it('delegates uploadFile to adapter', async () => {
    const client = new IPFSClient(mockAdapter)
    const data = new Uint8Array([1, 2, 3])
    const result = await client.uploadFile(data, 'test.txt')

    expect(mockAdapter.uploadFile).toHaveBeenCalledWith(data, 'test.txt')
    expect(result).toBe('ipfs://QmFile')
  })

  describe('resolveURI', () => {
    it('uses the default cloudflare gateway when no options are provided', () => {
      const client = new IPFSClient(mockAdapter)
      expect(client.resolveURI('ipfs://QmTest123')).toBe('https://cloudflare-ipfs.com/ipfs/QmTest123')
    })

    it('uses a custom gateway when provided', () => {
      const client = new IPFSClient(mockAdapter, { gatewayUrl: 'https://ipfs.io/ipfs/' })
      expect(client.resolveURI('ipfs://QmTest123')).toBe('https://ipfs.io/ipfs/QmTest123')
    })

    it('appends a trailing slash to the gateway if missing', () => {
      const client = new IPFSClient(mockAdapter, { gatewayUrl: 'https://mygateway.com/ipfs' })
      expect(client.gatewayUrl).toBe('https://mygateway.com/ipfs/')
      expect(client.resolveURI('ipfs://QmTest123')).toBe('https://mygateway.com/ipfs/QmTest123')
    })

    it('returns http(s) URLs unmodified', () => {
      const client = new IPFSClient(mockAdapter)
      const url = 'https://example.com/metadata.json'
      expect(client.resolveURI(url)).toBe(url)
    })
  })
})
