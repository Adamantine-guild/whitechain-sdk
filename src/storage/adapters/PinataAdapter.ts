import { IPFSAdapter } from './types.js'
import { fetchWithRetry } from './utils.js'

export class PinataAdapter implements IPFSAdapter {
  /**
   * @param jwt The Pinata JWT (API Key)
   */
  constructor(private readonly jwt: string) {}

  async uploadJSON(data: Record<string, unknown>): Promise<string> {
    const response = await fetchWithRetry('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.jwt}`,
      },
      body: JSON.stringify({
        pinataContent: data,
      }),
    })

    const result = (await response.json()) as { IpfsHash: string }
    return `ipfs://${result.IpfsHash}`
  }

  async uploadFile(data: Uint8Array | Blob, name?: string): Promise<string> {
    // Rely on global FormData (available in modern Node and all browsers)
    const formData = new FormData()

    const blob = data instanceof Uint8Array ? new Blob([data as any]) : data
    formData.append('file', blob, name || 'upload')

    const response = await fetchWithRetry('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.jwt}`,
      },
      // In TS DOM lib, body can be FormData
      body: formData as unknown as BodyInit,
    })

    const result = (await response.json()) as { IpfsHash: string }
    return `ipfs://${result.IpfsHash}`
  }
}
