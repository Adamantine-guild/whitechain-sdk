/** A compact secp256k1 ECDSA signature: 32-byte r, 32-byte s, and a recovery id. */
export interface Signature {
  /** 32-byte big-endian r value. */
  r: Uint8Array
  /** 32-byte big-endian s value, always normalized to the lower half of the curve order. */
  s: Uint8Array
  /** Recovery id (0 or 1 in practice; 2/3 are reserved for x-coordinate overflow). */
  recovery: number
}

/** A secp256k1 implementation, backed by either WebAssembly or pure JavaScript. */
export interface SignerBackend {
  /** Identifies which implementation produced a result. Never logged with key material. */
  readonly name: 'wasm' | 'js'
  /** Derives the public key for a 32-byte private key. */
  getPublicKey(privateKey: Uint8Array, compressed?: boolean): Uint8Array
  /** Signs a 32-byte message hash with a 32-byte private key. RFC6979 deterministic, low-S normalized. */
  sign(hash: Uint8Array, privateKey: Uint8Array): Signature
  /** Verifies a signature against a 32-byte message hash and a public key. */
  verify(hash: Uint8Array, signature: Signature, publicKey: Uint8Array): boolean
  /** Recovers the public key that produced `signature` over `hash`. */
  recoverPublicKey(hash: Uint8Array, signature: Signature, compressed?: boolean): Uint8Array
}
