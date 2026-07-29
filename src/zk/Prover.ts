/**
 * ZkProver — the main public facade for generating Groth16 zk-SNARK proofs.
 *
 * Abstracts all complexity:
 *  - Fetching + caching .wasm and .zkey files from a CDN
 *  - Verifying artifact integrity (SHA-256) before use
 *  - Offloading proof generation to a Web Worker (no UI freezing)
 *  - Falling back to main-thread execution in Node.js / environments without Worker
 *  - Formatting proof output into Solidity-ready calldata
 *
 * @example
 * ```ts
 * import { ZkProver } from 'whitechain-sdk'
 *
 * const prover = new ZkProver({
 *   wasmUrl: 'https://cdn.example.com/vote.wasm',
 *   zkeyUrl: 'https://cdn.example.com/vote_final.zkey',
 *   wasmHash: 'abc123...', // optional SHA-256 integrity hash
 *   zkeyHash: 'def456...', // optional SHA-256 integrity hash
 * })
 *
 * // Runs in a Web Worker — UI stays responsive
 * const calldata = await prover.prove({
 *   nullifier: '123456',
 *   voteOption: '1',
 *   merkleProof: [...],
 * })
 *
 * // Pass directly to the on-chain verifier
 * await governanceContract.castVote(calldata.pA, calldata.pB, calldata.pC, calldata.pubSignals)
 * ```
 */

import { fetchArtifact } from './artifacts.js'
import { formatCalldata } from './format.js'
import { createWorkerBlobUrl } from './worker.js'
import type { ZkProverOptions, ProofCalldata, SnarkJSModule, Groth16Proof } from './types.js'

export class ZkProver {
  private readonly options: ZkProverOptions

  constructor(options: ZkProverOptions) {
    if (!options.wasmUrl) throw new Error('ZkProver: wasmUrl is required')
    if (!options.zkeyUrl) throw new Error('ZkProver: zkeyUrl is required')
    this.options = options
  }

  /**
   * Generates a Groth16 zk-SNARK proof for the given circuit input.
   *
   * The proving pipeline:
   * 1. Downloads .wasm and .zkey files in parallel (cached after first call).
   * 2. Optionally verifies SHA-256 hashes.
   * 3. If `Worker` is available (browser): runs `snarkjs.groth16.fullProve` in a
   *    Web Worker using Transferable buffers for zero-copy performance.
   * 4. If `Worker` is not available (Node.js/SSR): falls back to direct main-thread execution.
   * 5. Formats the raw SnarkJS output into Solidity `uint256` calldata.
   *
   * @param input  The private and public inputs required by the circuit.
   * @returns      `ProofCalldata` ready to pass to the on-chain Groth16 verifier.
   */
  async prove(input: Record<string, unknown>): Promise<ProofCalldata> {
    // Step 1 & 2: Fetch and verify artifacts in parallel
    const [wasm, zkey] = await Promise.all([
      fetchArtifact(this.options.wasmUrl, this.options.wasmHash),
      fetchArtifact(this.options.zkeyUrl, this.options.zkeyHash),
    ])

    // Step 3: Run in Web Worker if available, else fall back to main thread
    const { proof, publicSignals } = typeof Worker !== 'undefined'
      ? await this._proveInWorker(wasm, zkey, input)
      : await this._proveMainThread(wasm, zkey, input)

    // Step 4: Format calldata
    return formatCalldata(proof, publicSignals)
  }

  /**
   * Runs proof generation in a Web Worker using a Blob URL.
   * Buffers are transferred (zero-copy) to the worker thread.
   */
  private _proveInWorker(
    wasm: Uint8Array,
    zkey: Uint8Array,
    input: Record<string, unknown>
  ): Promise<{ proof: Groth16Proof; publicSignals: string[] }> {
    return new Promise((resolve, reject) => {
      let blobUrl: string | null = null

      try {
        blobUrl = createWorkerBlobUrl()
      } catch {
        // If Blob URL creation fails (e.g. missing Blob API), fall back to main thread
        this._proveMainThread(wasm, zkey, input).then(resolve).catch(reject)
        return
      }

      const worker = new Worker(blobUrl, { type: 'module' })

      worker.onmessage = (event) => {
        URL.revokeObjectURL(blobUrl!)
        worker.terminate()

        const { proof, publicSignals, error } = event.data
        if (error) {
          reject(new Error(`ZkProver worker error: ${error}`))
        } else {
          resolve({ proof, publicSignals })
        }
      }

      worker.onerror = (err) => {
        URL.revokeObjectURL(blobUrl!)
        worker.terminate()
        reject(new Error(`ZkProver worker crashed: ${err.message}`))
      }

      // Transfer buffers (zero-copy) — originals become detached
      const wasmCopy = wasm.slice()
      const zkeyCopy = zkey.slice()

      worker.postMessage(
        { wasmBuffer: wasmCopy.buffer, zkeyBuffer: zkeyCopy.buffer, input },
        [wasmCopy.buffer, zkeyCopy.buffer]
      )
    })
  }

  /**
   * Main-thread fallback for Node.js and SSR environments without Worker.
   * Dynamically imports snarkjs so non-ZK users never pay the load cost.
   */
  private async _proveMainThread(
    wasm: Uint8Array,
    zkey: Uint8Array,
    input: Record<string, unknown>
  ): Promise<{ proof: Groth16Proof; publicSignals: string[] }> {
    let snarkjs: SnarkJSModule

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      snarkjs = (await import('snarkjs' as any)) as SnarkJSModule
    } catch {
      throw new Error(
        'snarkjs is not installed. Run: npm install snarkjs\n' +
          'snarkjs is an optional peer dependency required only for ZK proof generation.'
      )
    }

    return snarkjs.groth16.fullProve(input, wasm, zkey)
  }
}
