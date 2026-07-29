import { IPFSAdapter } from './types.js'
import { fetchWithRetry } from './utils.js'

export class NFTStorageAdapter implements IPFSAdapter {
  /**
   * @param apiKey The NFT.storage API Key
   */
  constructor(private readonly apiKey: string) {}

  async uploadJSON(data: Record<string, unknown>): Promise<string> {
    const jsonString = JSON.stringify(data)
    const blob = new Blob([jsonString], { type: 'application/json' })

    const response = await fetchWithRetry('https://api.nft.storage/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: blob,
    })

    const result = (await response.json()) as { value: { cid: string } }
    return `ipfs://${result.value.cid}`
  }

  async uploadFile(data: Uint8Array | Blob, name?: string): Promise<string> {
    // NFT.storage /upload endpoint expects the raw binary data in the body
    const blob = data instanceof Uint8Array ? new Blob([data as any]) : data

    const response = await fetchWithRetry('https://api.nft.storage/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        // Set a default content-type, or let the browser/node infer it if possible
        'Content-Type': blob.type || 'application/octet-stream',
      },
      body: blob,
    })

    const result = (await response.json()) as { value: { cid: string } }
    return `ipfs://${result.value.cid}`
  }
}
