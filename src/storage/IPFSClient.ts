import type { IPFSAdapter } from './adapters/types.js'

export interface IPFSClientOptions {
  /**
   * The public gateway used to resolve IPFS URIs.
   * Default: 'https://cloudflare-ipfs.com/ipfs/'
   */
  gatewayUrl?: string
}

/**
 * Unified Storage Manager for IPFS uploading and resolution.
 * Simplifies managing off-chain metadata natively in the SDK.
 */
export class IPFSClient {
  private readonly adapter: IPFSAdapter
  public readonly gatewayUrl: string

  constructor(adapter: IPFSAdapter, options?: IPFSClientOptions) {
    this.adapter = adapter
    this.gatewayUrl = options?.gatewayUrl ?? 'https://cloudflare-ipfs.com/ipfs/'
    
    // Ensure gateway URL ends with a slash
    if (!this.gatewayUrl.endsWith('/')) {
      this.gatewayUrl += '/'
    }
  }

  /**
   * Upload a JSON object to IPFS.
   * @param data The JS object to upload.
   * @returns A promise that resolves to the `ipfs://...` URI.
   */
  async uploadJSON(data: Record<string, unknown>): Promise<string> {
    return this.adapter.uploadJSON(data)
  }

  /**
   * Upload a file or binary data to IPFS.
   * @param data The file data (Blob, File, or Uint8Array).
   * @param name Optional filename to associate with the upload.
   * @returns A promise that resolves to the `ipfs://...` URI.
   */
  async uploadFile(data: Uint8Array | Blob, name?: string): Promise<string> {
    return this.adapter.uploadFile(data, name)
  }

  /**
   * Resolves an `ipfs://...` URI into an HTTP public gateway URL.
   * If the provided URI is already an HTTP(s) URL, it is returned unmodified.
   *
   * @param uri The URI to resolve.
   * @returns The HTTP URL for the resource.
   */
  resolveURI(uri: string): string {
    if (uri.startsWith('ipfs://')) {
      const cid = uri.replace('ipfs://', '')
      return `${this.gatewayUrl}${cid}`
    }
    return uri
  }
}
