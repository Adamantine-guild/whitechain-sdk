import { jsBackend } from './backends/js.js'
import { createWasmBackend } from './backends/wasm.js'
import type { SignerBackend } from './types.js'

let backendPromise: Promise<SignerBackend> | null = null

function isWebAssemblySupported(): boolean {
  return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function'
}

async function loadBackend(): Promise<SignerBackend> {
  if (!isWebAssemblySupported()) return jsBackend
  try {
    const wasmModule = await import('tiny-secp256k1')
    return createWasmBackend(wasmModule)
  } catch {
    return jsBackend
  }
}

/**
 * Returns the active {@link SignerBackend}, lazily loading and caching it on
 * first call. All callers -- including concurrent ones racing before the
 * first call resolves -- share the same in-flight promise, so the WASM
 * module is imported and initialized at most once per process.
 *
 * Loading never throws: an unavailable `WebAssembly` global, a failed
 * dynamic import, or a malformed module all resolve to the JS backend
 * instead of rejecting. Errors from actually calling `sign`/`verify`/etc.
 * (invalid keys, malformed hashes) are a separate concern and always
 * propagate from the chosen backend without triggering a fallback.
 */
export function getSignerBackend(): Promise<SignerBackend> {
  if (!backendPromise) backendPromise = loadBackend()
  return backendPromise
}

/** Test-only: clears the cached backend so the next call re-initializes from scratch. */
export function __resetSignerBackendForTests(): void {
  backendPromise = null
}
