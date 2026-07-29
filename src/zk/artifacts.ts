/**
 * Secure fetching and in-memory caching of large ZK proving artifacts
 * (.wasm circuit files and .zkey proving keys).
 */

import { verifyIntegrity } from './integrity.js'

/** Module-level cache to prevent redundant CDN downloads. */
const _artifactCache = new Map<string, Uint8Array>()

/**
 * Downloads a proving artifact (wasm/zkey) from a URL, optionally verifies
 * its SHA-256 hash, and caches the result in memory.
 *
 * On subsequent calls with the same URL, the cached buffer is returned
 * immediately without any network request.
 *
 * @param url           The URL to fetch the artifact from.
 * @param expectedHash  Optional SHA-256 hex digest to verify after download.
 * @returns             The file contents as a `Uint8Array`.
 *
 * @throws If the network request fails or the integrity check fails.
 */
export async function fetchArtifact(
  url: string,
  expectedHash?: string
): Promise<Uint8Array> {
  // Return from cache if available
  const cached = _artifactCache.get(url)
  if (cached) return cached

  let lastError: unknown

  // Exponential backoff retry (mirrors fetchWithRetry from storage)
  let delay = 1000
  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url)

      if (response.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, delay))
        delay *= 2
        continue
      }

      if (!response.ok) {
        throw new Error(
          `Failed to fetch artifact from ${url}: HTTP ${response.status} ${response.statusText}`
        )
      }

      const buffer = new Uint8Array(await response.arrayBuffer())

      // Integrity check
      if (expectedHash) {
        const valid = await verifyIntegrity(buffer, expectedHash)
        if (!valid) {
          throw new Error(
            `Integrity check failed for ${url}. ` +
              'The downloaded file does not match the expected SHA-256 hash. ' +
              'This may indicate a compromised CDN or corrupted file.'
          )
        }
      }

      _artifactCache.set(url, buffer)
      return buffer
    } catch (err) {
      lastError = err
      if (
        err instanceof Error &&
        (err.message.includes('Integrity check') ||
          err.message.includes('Failed to fetch artifact'))
      ) {
        throw err
      }
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, delay))
        delay *= 2
      }
    }
  }

  throw lastError ?? new Error(`Failed to fetch artifact from ${url}`)
}

/**
 * Clears the in-memory artifact cache.
 * Useful for testing or when proving keys are rotated.
 */
export function clearArtifactCache(): void {
  _artifactCache.clear()
}
