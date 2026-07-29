export { sign, verify, recoverPublicKey, getPublicKey, getActiveBackendName } from './signer.js'
export type { Signature, SignerBackend } from './types.js'

export {
  verifyAccountProof,
  verifyStorageProof,
  verifyEIP1186Proof,
  isValidStateProof,
  EMPTY_TRIE_ROOT,
  EMPTY_CODE_HASH,
  type AccountProofInput,
  type StorageProofInput,
  type ProofVerificationResult,
  type EIP1186VerificationResult,
} from './StateProver.js'
