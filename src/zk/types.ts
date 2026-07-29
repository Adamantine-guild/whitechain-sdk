/**
 * Shared TypeScript interfaces and types for the ZK Prover module.
 */

/**
 * Options for configuring the ZkProver.
 */
export interface ZkProverOptions {
  /**
   * URL to the compiled `.wasm` file for the circuit.
   * Will be fetched at runtime and cached in memory.
   */
  wasmUrl: string

  /**
   * URL to the `.zkey` proving key file for the circuit.
   * Will be fetched at runtime and cached in memory.
   */
  zkeyUrl: string

  /**
   * Optional SHA-256 hex digest of the `.wasm` file.
   * If provided, the downloaded file will be verified before use.
   * Prevents supply-chain attacks via CDN compromise.
   */
  wasmHash?: string

  /**
   * Optional SHA-256 hex digest of the `.zkey` file.
   * If provided, the downloaded file will be verified before use.
   */
  zkeyHash?: string
}

/**
 * Raw Groth16 proof as returned by SnarkJS.
 */
export interface Groth16Proof {
  pi_a: [string, string, string]
  pi_b: [[string, string], [string, string], [string, string]]
  pi_c: [string, string, string]
  protocol: string
  curve: string
}

/**
 * On-chain ready calldata for the Solidity Groth16 verifier.
 *
 * Maps directly to the verifier's `verifyProof(uint[2] pA, uint[2][2] pB, uint[2] pC, uint[] pubSignals)`.
 */
export interface ProofCalldata {
  /** G1 point A: [x, y] */
  pA: [bigint, bigint]
  /** G2 point B: [[x1, x0], [y1, y0]] — note: coordinates are reversed per BN254 convention */
  pB: [[bigint, bigint], [bigint, bigint]]
  /** G1 point C: [x, y] */
  pC: [bigint, bigint]
  /** Public circuit signals */
  pubSignals: bigint[]
}

/**
 * Internal type holding downloaded artifact buffers.
 */
export interface FetchedArtifacts {
  wasm: Uint8Array
  zkey: Uint8Array
}

/**
 * SnarkJS module shape (subset used by the prover).
 * Typed loosely to avoid requiring @types/snarkjs.
 */
export interface SnarkJSModule {
  groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmFile: Uint8Array | string,
      zkeyFile: Uint8Array | string
    ): Promise<{ proof: Groth16Proof; publicSignals: string[] }>
  }
}
