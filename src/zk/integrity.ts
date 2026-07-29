/**
 * Runtime integrity verification using the Web Crypto API (SHA-256).
 * Works identically in Node.js (>=18) and browser environments via globalThis.crypto.
 */

/**
 * Converts an ArrayBuffer to a lowercase hex string.
 */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Verifies the SHA-256 integrity of a buffer against an expected hex hash.
 *
 * @param buffer       The downloaded file content.
 * @param expectedHash The expected lowercase SHA-256 hex digest.
 * @returns `true` if the hash matches, `false` otherwise.
 *
 * @example
 * ```ts
 * const ok = await verifyIntegrity(wasmBuffer, '0xabc123...')
 * if (!ok) throw new Error('WASM integrity check failed')
 * ```
 */
export async function verifyIntegrity(
  buffer: Uint8Array,
  expectedHash: string
): Promise<boolean> {
  const crypto = globalThis.crypto
  if (!crypto?.subtle) {
    throw new Error(
      'Web Crypto API is not available in this environment. ' +
        'Upgrade to Node.js >= 18 or use a modern browser.'
    )
  }

  // Copy into a plain ArrayBuffer — SubtleCrypto requires ArrayBuffer, not ArrayBufferLike
  const plainBuffer = buffer.slice().buffer as ArrayBuffer
  const hashBuffer = await crypto.subtle.digest('SHA-256', plainBuffer)
  const actualHash = bufferToHex(hashBuffer)

  // Normalise the expected hash — strip optional 0x prefix, lowercase
  const normalised = expectedHash.replace(/^0x/i, '').toLowerCase()

  return actualHash === normalised
}
