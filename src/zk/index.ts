/**
 * ZK Prover module — barrel export.
 *
 * Provides Groth16 zk-SNARK proof generation with Web Worker offloading,
 * CDN artifact fetching with integrity verification, and Solidity calldata formatting.
 *
 * snarkjs must be installed separately as a peer dependency:
 *   npm install snarkjs
 */

export { ZkProver } from './Prover.js'
export { formatCalldata } from './format.js'
export { verifyIntegrity } from './integrity.js'
export { fetchArtifact, clearArtifactCache } from './artifacts.js'

export type {
  ZkProverOptions,
  Groth16Proof,
  ProofCalldata,
  FetchedArtifacts,
  SnarkJSModule,
} from './types.js'
