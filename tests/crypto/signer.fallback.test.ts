import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { sign, getActiveBackendName } from '../../src/crypto/index.js'
import { __resetSignerBackendForTests } from '../../src/crypto/loader.js'

const PRIVATE_KEY = Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 1 : 0))
const HASH = new Uint8Array(32).fill(7)

/** A minimal, validly-shaped `tiny-secp256k1` module double for caching/dedup tests. */
function fakeWasmModule() {
  return {
    sign: () => new Uint8Array(64),
    signRecoverable: () => ({ signature: new Uint8Array(64), recoveryId: 0 }),
    verify: () => true,
    recover: () => new Uint8Array(33),
    pointFromScalar: () => new Uint8Array(33),
  }
}

describe('invalid input does not trigger a fallback (real, unmocked backend)', () => {
  beforeEach(() => {
    __resetSignerBackendForTests()
  })

  it('propagates a curve-validity error for an invalid private key, and the backend stays WASM', async () => {
    const zeroKey = new Uint8Array(32) // 0 is not a valid scalar: must be in [1, n-1]
    await expect(sign(HASH, zeroKey)).rejects.toThrow()
    expect(await getActiveBackendName()).toBe('wasm')
  })

  it('rejects a wrong-length hash before ever touching a backend', async () => {
    const shortHash = new Uint8Array(31)
    await expect(sign(shortHash, PRIVATE_KEY)).rejects.toThrow(/32 bytes/)
  })

  it('rejects a wrong-length private key before ever touching a backend', async () => {
    const shortKey = new Uint8Array(16)
    await expect(sign(HASH, shortKey)).rejects.toThrow(/32 bytes/)
  })
})

describe('backend loading and fallback (mocked)', () => {
  const originalWebAssembly = globalThis.WebAssembly

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock('tiny-secp256k1')
    globalThis.WebAssembly = originalWebAssembly
  })

  it('falls back to JS without attempting an import when WebAssembly is unavailable', async () => {
    // @ts-expect-error - deliberately simulating an environment without WebAssembly
    delete globalThis.WebAssembly

    const importSpy = vi.fn(fakeWasmModule)
    vi.doMock('tiny-secp256k1', importSpy)

    const { getSignerBackend } = await import('../../src/crypto/loader.js')
    const backend = await getSignerBackend()

    expect(backend.name).toBe('js')
    expect(importSpy).not.toHaveBeenCalled()
  })

  it('falls back to JS when the dynamic import rejects', async () => {
    vi.doMock('tiny-secp256k1', () => {
      throw new Error('simulated: wasm module cannot be imported')
    })

    const { getSignerBackend } = await import('../../src/crypto/loader.js')
    const backend = await getSignerBackend()

    expect(backend.name).toBe('js')
  })

  it('falls back to JS when the imported module is malformed (initialization failure)', async () => {
    vi.doMock('tiny-secp256k1', () => ({ sign: () => new Uint8Array(64) })) // missing verify/recover/etc.

    const { getSignerBackend } = await import('../../src/crypto/loader.js')
    const backend = await getSignerBackend()

    expect(backend.name).toBe('js')
  })

  it('still produces a working, correctly-behaving signer after falling back', async () => {
    vi.doMock('tiny-secp256k1', () => {
      throw new Error('simulated failure')
    })

    const { getSignerBackend } = await import('../../src/crypto/loader.js')
    const backend = await getSignerBackend()

    const pubkey = backend.getPublicKey(PRIVATE_KEY)
    const signature = backend.sign(HASH, PRIVATE_KEY)
    expect(backend.verify(HASH, signature, pubkey)).toBe(true)
  })

  it('initializes the backend exactly once and reuses it on later calls', async () => {
    vi.doMock('tiny-secp256k1', fakeWasmModule)

    const { getSignerBackend } = await import('../../src/crypto/loader.js')
    const first = await getSignerBackend()
    const second = await getSignerBackend()

    expect(second).toBe(first)
  })

  it('shares one initialization promise across concurrent first-use calls', async () => {
    vi.doMock('tiny-secp256k1', fakeWasmModule)

    const { getSignerBackend } = await import('../../src/crypto/loader.js')
    const [a, b, c] = await Promise.all([
      getSignerBackend(),
      getSignerBackend(),
      getSignerBackend(),
    ])
    const d = await getSignerBackend()

    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(c).toBe(d)
  })
})
