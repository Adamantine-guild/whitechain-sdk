import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ZkProver } from '../../src/zk/Prover.js'
import { clearArtifactCache } from '../../src/zk/artifacts.js'
import type { Groth16Proof } from '../../src/zk/types.js'

const MOCK_WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d])
const MOCK_ZKEY = new Uint8Array([0x7a, 0x6b, 0x65, 0x79])

const MOCK_PROOF: Groth16Proof = {
  pi_a: ['11', '22', '1'],
  pi_b: [
    ['33', '44'],
    ['55', '66'],
    ['1', '0'],
  ],
  pi_c: ['77', '88', '1'],
  protocol: 'groth16',
  curve: 'bn128',
}

const MOCK_SIGNALS = ['1', '0']

function mockFetchArtifacts() {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(MOCK_WASM.buffer, { status: 200 })
  )
}

beforeEach(() => {
  clearArtifactCache()
  vi.restoreAllMocks()
  // Ensure Worker is NOT available so we always exercise the main-thread path
  vi.stubGlobal('Worker', undefined)
})

describe('ZkProver constructor', () => {
  it('throws if wasmUrl is missing', () => {
    expect(
      () => new ZkProver({ wasmUrl: '', zkeyUrl: 'https://example.com/zkey' })
    ).toThrow('wasmUrl is required')
  })

  it('throws if zkeyUrl is missing', () => {
    expect(
      () => new ZkProver({ wasmUrl: 'https://example.com/wasm', zkeyUrl: '' })
    ).toThrow('zkeyUrl is required')
  })
})

describe('ZkProver.prove() — main-thread fallback', () => {
  const PROVER_OPTIONS = {
    wasmUrl: 'https://cdn.example.com/vote.wasm',
    zkeyUrl: 'https://cdn.example.com/vote.zkey',
  }

  it('calls snarkjs and returns formatted calldata', async () => {
    // Mock fetch for both wasm and zkey
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(MOCK_WASM.buffer, { status: 200 }))
      .mockResolvedValueOnce(new Response(MOCK_ZKEY.buffer, { status: 200 }))

    // Mock snarkjs dynamic import
    vi.doMock('snarkjs', () => ({
      groth16: {
        fullProve: vi.fn().mockResolvedValue({
          proof: MOCK_PROOF,
          publicSignals: MOCK_SIGNALS,
        }),
      },
    }))

    const prover = new ZkProver(PROVER_OPTIONS)
    const calldata = await prover.prove({ nullifier: '42', voteOption: '1' })

    expect(calldata.pA).toHaveLength(2)
    expect(calldata.pB).toHaveLength(2)
    expect(calldata.pC).toHaveLength(2)
    expect(calldata.pubSignals).toEqual([1n, 0n])
  })

  it('pB coordinates are correctly reversed', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(MOCK_WASM.buffer, { status: 200 }))
      .mockResolvedValueOnce(new Response(MOCK_ZKEY.buffer, { status: 200 }))

    vi.doMock('snarkjs', () => ({
      groth16: {
        fullProve: vi.fn().mockResolvedValue({
          proof: MOCK_PROOF,
          publicSignals: MOCK_SIGNALS,
        }),
      },
    }))

    const prover = new ZkProver(PROVER_OPTIONS)
    const calldata = await prover.prove({})

    // pi_b[0] = ['33', '44'] → pB[0] = [44n, 33n]
    expect(calldata.pB[0][0]).toBe(44n)
    expect(calldata.pB[0][1]).toBe(33n)
    // pi_b[1] = ['55', '66'] → pB[1] = [66n, 55n]
    expect(calldata.pB[1][0]).toBe(66n)
    expect(calldata.pB[1][1]).toBe(55n)
  })

  it('throws a helpful error when snarkjs is not installed', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(MOCK_WASM.buffer, { status: 200 }))
      .mockResolvedValueOnce(new Response(MOCK_ZKEY.buffer, { status: 200 }))

    vi.doMock('snarkjs', () => {
      throw new Error('Cannot find module snarkjs')
    })

    const prover = new ZkProver(PROVER_OPTIONS)
    await expect(prover.prove({})).rejects.toThrow('npm install snarkjs')
  })

  it('propagates artifact integrity failure', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(MOCK_WASM.buffer, { status: 200 }))
      .mockResolvedValueOnce(new Response(MOCK_ZKEY.buffer, { status: 200 }))

    const prover = new ZkProver({
      ...PROVER_OPTIONS,
      wasmHash: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    })

    await expect(prover.prove({})).rejects.toThrow('Integrity check failed')
  })
})
