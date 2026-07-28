/**
 * Standard interface for IPFS pinning service adapters.
 */
export interface IPFSAdapter {
  /**
   * Upload a JavaScript object as JSON to IPFS.
   * @param data The JSON object to upload.
   * @returns A promise that resolves to the `ipfs://...` URI.
   */
  uploadJSON(data: Record<string, unknown>): Promise<string>

  /**
   * Upload a binary file or Blob to IPFS.
   * @param data The file data (Blob, File, or Uint8Array).
   * @param name Optional filename for the upload.
   * @returns A promise that resolves to the `ipfs://...` URI.
   */
  uploadFile(data: Uint8Array | Blob, name?: string): Promise<string>
}
