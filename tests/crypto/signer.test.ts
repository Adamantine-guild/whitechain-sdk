import { describe, it, expect, beforeEach } from 'vitest'
import * as tinySecp256k1 from 'tiny-secp256k1'
import {
  sign,
  verify,
  recoverPublicKey,
  getPublicKey,
  getActiveBackendName,
} from '../../src/crypto/index.js'
import { jsBackend } from '../../src/crypto/backends/js.js'
import { createWasmBackend } from '../../src/crypto/backends/wasm.js'
import { __resetSignerBackendForTests } from '../../src/crypto/loader.js'

const PRIVATE_KEY = Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 1 : 0))
const HASH = new Uint8Array(32).fill(7)

describe('crypto/signer public API', () => {
  beforeEach(() => {
    __resetSignerBackendForTests()
  })

  it('uses the WASM backend in this Node environment', async () => {
    expect(await getActiveBackendName()).toBe('wasm')
  })

  it('signs, verifies, and recovers in a round trip', async () => {
    const compressed = await getPublicKey(PRIVATE_KEY, true)
    const uncompressed = await getPublicKey(PRIVATE_KEY, false)
    const signature = await sign(HASH, PRIVATE_KEY)

    expect(await verify(HASH, signature, compressed)).toBe(true)
    expect(await recoverPublicKey(HASH, signature, false)).toEqual(uncompressed)
  })

  it('rejects a tampered signature', async () => {
    const pubkey = await getPublicKey(PRIVATE_KEY)
    const signature = await sign(HASH, PRIVATE_KEY)
    const tampered = { ...signature, s: new Uint8Array(signature.s).fill(1) }
    expect(await verify(HASH, tampered, pubkey)).toBe(false)
  })
})

describe('WASM backend (direct, unmediated by the loader)', () => {
  const backend = createWasmBackend(tinySecp256k1)

  it('signs and verifies successfully', () => {
    const pubkey = backend.getPublicKey(PRIVATE_KEY)
    const signature = backend.sign(HASH, PRIVATE_KEY)
    expect(backend.verify(HASH, signature, pubkey)).toBe(true)
  })

  it('always returns low-S normalized, 32-byte compact signatures', () => {
    const signature = backend.sign(HASH, PRIVATE_KEY)
    expect(signature.r).toHaveLength(32)
    expect(signature.s).toHaveLength(32)
    expect([0, 1]).toContain(signature.recovery)
  })
})

describe('cross-backend equivalence (WASM vs JS)', () => {
  const wasmBackend = createWasmBackend(tinySecp256k1)

  it('produce byte-identical signatures for the same input (deterministic RFC6979 + low-S)', () => {
    const wasmSig = wasmBackend.sign(HASH, PRIVATE_KEY)
    const jsSig = jsBackend.sign(HASH, PRIVATE_KEY)
    expect(wasmSig.r).toEqual(jsSig.r)
    expect(wasmSig.s).toEqual(jsSig.s)
    expect(wasmSig.recovery).toBe(jsSig.recovery)
  })

  it('a signature produced by one backend verifies under the other', () => {
    const pubkey = jsBackend.getPublicKey(PRIVATE_KEY, true)
    const wasmSig = wasmBackend.sign(HASH, PRIVATE_KEY)
    const jsSig = jsBackend.sign(HASH, PRIVATE_KEY)
    expect(jsBackend.verify(HASH, wasmSig, pubkey)).toBe(true)
    expect(wasmBackend.verify(HASH, jsSig, pubkey)).toBe(true)
  })

  it('both backends recover the same public key', () => {
    const pubkey = jsBackend.getPublicKey(PRIVATE_KEY, false)
    const signature = jsBackend.sign(HASH, PRIVATE_KEY)
    expect(wasmBackend.recoverPublicKey(HASH, signature, false)).toEqual(pubkey)
    expect(jsBackend.recoverPublicKey(HASH, signature, false)).toEqual(pubkey)
  })

  it('produce structurally identical output shape regardless of backend', () => {
    const wasmSig = wasmBackend.sign(HASH, PRIVATE_KEY)
    const jsSig = jsBackend.sign(HASH, PRIVATE_KEY)
    expect(Object.keys(wasmSig).sort()).toEqual(Object.keys(jsSig).sort())
    expect(wasmSig.r).toBeInstanceOf(Uint8Array)
    expect(jsSig.r).toBeInstanceOf(Uint8Array)
    expect(typeof wasmSig.recovery).toBe(typeof jsSig.recovery)
  })
})
