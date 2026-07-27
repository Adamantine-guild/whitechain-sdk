import { getSignerBackend } from './loader.js'
import type { Signature } from './types.js'

function assertLength(name: string, value: Uint8Array, length: number): void {
  if (value.length !== length) {
    throw new Error(`Expected ${name} to be ${length} bytes, got ${value.length}`)
  }
}

/**
 * Derives the public key for a 32-byte private key.
 * @throws if `privateKey` is not 32 bytes, or is not a valid scalar for secp256k1.
 */
export async function getPublicKey(privateKey: Uint8Array, compressed = true): Promise<Uint8Array> {
  assertLength('privateKey', privateKey, 32)
  const backend = await getSignerBackend()
  return backend.getPublicKey(privateKey, compressed)
}

/**
 * Signs a 32-byte message hash with a 32-byte private key.
 * Deterministic (RFC6979) and always low-S normalized.
 * @throws if `hash`/`privateKey` are not 32 bytes, or `privateKey` is not a valid scalar.
 */
export async function sign(hash: Uint8Array, privateKey: Uint8Array): Promise<Signature> {
  assertLength('hash', hash, 32)
  assertLength('privateKey', privateKey, 32)
  const backend = await getSignerBackend()
  return backend.sign(hash, privateKey)
}

/**
 * Verifies a signature against a 32-byte message hash and a public key.
 * Rejects non-normalized (high-S) signatures.
 * @throws if `hash`/`signature.r`/`signature.s` are not 32 bytes.
 */
export async function verify(hash: Uint8Array, signature: Signature, publicKey: Uint8Array): Promise<boolean> {
  assertLength('hash', hash, 32)
  assertLength('signature.r', signature.r, 32)
  assertLength('signature.s', signature.s, 32)
  const backend = await getSignerBackend()
  return backend.verify(hash, signature, publicKey)
}

/**
 * Recovers the public key that produced `signature` over `hash`.
 * @throws if `hash`/`signature.r`/`signature.s` are not 32 bytes, or the key cannot be recovered.
 */
export async function recoverPublicKey(
  hash: Uint8Array,
  signature: Signature,
  compressed = false,
): Promise<Uint8Array> {
  assertLength('hash', hash, 32)
  assertLength('signature.r', signature.r, 32)
  assertLength('signature.s', signature.s, 32)
  const backend = await getSignerBackend()
  return backend.recoverPublicKey(hash, signature, compressed)
}

/** Reports which backend is currently active ('wasm' or 'js'). Never exposes key material. */
export async function getActiveBackendName(): Promise<'wasm' | 'js'> {
  const backend = await getSignerBackend()
  return backend.name
}
