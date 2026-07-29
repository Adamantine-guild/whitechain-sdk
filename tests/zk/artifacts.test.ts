import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchArtifact, clearArtifactCache } from '../../src/zk/artifacts.js'

// Helper: compute SHA-256 of a buffer
async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const MOCK_URL = 'https://cdn.example.com/vote.wasm'
const MOCK_DATA = new Uint8Array([0x00, 0x61, 0x73, 0x6d]) // WASM magic bytes

beforeEach(() => {
  clearArtifactCache()
  vi.restoreAllMocks()
})

describe('fetchArtifact', () => {
  it('downloads a file and returns a Uint8Array', async () => {
    const mockResponse = new Response(MOCK_DATA.buffer, { status: 200 })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse)

    const result = await fetchArtifact(MOCK_URL)
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result).toEqual(MOCK_DATA)
  })

  it('caches the result — second call does not fetch again', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(MOCK_DATA.buffer, { status: 200 })
    )

    await fetchArtifact(MOCK_URL)
    await fetchArtifact(MOCK_URL)

    // fetch should only have been called once
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('passes integrity check with correct hash', async () => {
    const hash = await sha256Hex(MOCK_DATA)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(MOCK_DATA.buffer, { status: 200 })
    )

    const result = await fetchArtifact(MOCK_URL, hash)
    expect(result).toEqual(MOCK_DATA)
  })

  it('throws if integrity check fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(MOCK_DATA.buffer, { status: 200 })
    )

    await expect(
      fetchArtifact(MOCK_URL, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef')
    ).rejects.toThrow('Integrity check failed')
  })

  it('throws on non-200 HTTP response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 404, statusText: 'Not Found' })
    )

    await expect(fetchArtifact(MOCK_URL)).rejects.toThrow('HTTP 404')
  })

  it('clearArtifactCache forces a re-fetch', async () => {
    let callCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      callCount++
      return new Response(MOCK_DATA.buffer, { status: 200 })
    })

    await fetchArtifact(MOCK_URL)
    expect(callCount).toBe(1)

    clearArtifactCache()
    await fetchArtifact(MOCK_URL)
    expect(callCount).toBe(2)
  })
})
