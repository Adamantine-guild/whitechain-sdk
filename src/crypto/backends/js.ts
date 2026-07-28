import { secp256k1 } from '@noble/curves/secp256k1'
import type { Signature, SignerBackend } from '../types.js'

function toSignature(compact: Uint8Array, recovery: number): Signature {
  return { r: compact.slice(0, 32), s: compact.slice(32, 64), recovery }
}

function toCompact(signature: Signature): Uint8Array {
  const compact = new Uint8Array(64)
  compact.set(signature.r, 0)
  compact.set(signature.s, 32)
  return compact
}

/**
 * Pure-JavaScript secp256k1 backend, backed by `@noble/curves`. Always available;
 * used both as the fallback when WASM cannot be loaded and as the reference
 * implementation the WASM backend's output is verified against.
 */
export const jsBackend: SignerBackend = {
  name: 'js',

  getPublicKey(privateKey, compressed = true) {
    return secp256k1.getPublicKey(privateKey, compressed)
  },

  sign(hash, privateKey) {
    const sig = secp256k1.sign(hash, privateKey, { lowS: true })
    return toSignature(sig.toCompactRawBytes(), sig.recovery)
  },

  verify(hash, signature, publicKey) {
    return secp256k1.verify(toCompact(signature), hash, publicKey, { lowS: true })
  },

  recoverPublicKey(hash, signature, compressed = false) {
    const sig = secp256k1.Signature.fromCompact(toCompact(signature)).addRecoveryBit(
      signature.recovery as 0 | 1,
    )
    return sig.recoverPublicKey(hash).toRawBytes(compressed)
  },
}
