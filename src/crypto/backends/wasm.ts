import type { Signature, SignerBackend } from '../types.js'

/** Shape of the `tiny-secp256k1` module we depend on, kept narrow and explicit. */
export interface TinySecp256k1Module {
  sign(h: Uint8Array, d: Uint8Array): Uint8Array
  signRecoverable(h: Uint8Array, d: Uint8Array): { signature: Uint8Array; recoveryId: number }
  verify(h: Uint8Array, Q: Uint8Array, signature: Uint8Array, strict?: boolean): boolean
  recover(h: Uint8Array, signature: Uint8Array, recoveryId: number, compressed?: boolean): Uint8Array | null
  pointFromScalar(d: Uint8Array, compressed?: boolean): Uint8Array | null
}

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
 * Wraps an already-imported `tiny-secp256k1` module as a {@link SignerBackend}.
 * Throws synchronously if the module doesn't expose the expected functions,
 * so callers (the loader) can treat that as an initialization failure and
 * fall back to the JS backend rather than surfacing a confusing runtime error later.
 */
export function createWasmBackend(mod: TinySecp256k1Module): SignerBackend {
  if (
    typeof mod.sign !== 'function' ||
    typeof mod.signRecoverable !== 'function' ||
    typeof mod.verify !== 'function' ||
    typeof mod.recover !== 'function' ||
    typeof mod.pointFromScalar !== 'function'
  ) {
    throw new Error('tiny-secp256k1 module is missing required exports')
  }

  return {
    name: 'wasm',

    getPublicKey(privateKey, compressed = true) {
      const pubkey = mod.pointFromScalar(privateKey, compressed)
      if (!pubkey) throw new Error('Point at infinity')
      return pubkey
    },

    sign(hash, privateKey) {
      const { signature, recoveryId } = mod.signRecoverable(hash, privateKey)
      return toSignature(signature, recoveryId)
    },

    verify(hash, signature, publicKey) {
      return mod.verify(hash, publicKey, toCompact(signature), true)
    },

    recoverPublicKey(hash, signature, compressed = false) {
      const pubkey = mod.recover(hash, toCompact(signature), signature.recovery, compressed)
      if (!pubkey) throw new Error('Could not recover public key')
      return pubkey
    },
  }
}
