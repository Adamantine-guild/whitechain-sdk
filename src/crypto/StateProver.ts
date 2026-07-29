/**
 * Cross-chain state proof verifier.
 *
 * Validates Ethereum EIP-1186 account and storage proofs (Merkle Patricia
 * Trie inclusion/exclusion proofs) locally against a caller-supplied,
 * trusted `stateRoot`. This module performs no RPC, HTTP, provider,
 * transport, or wallet/public client operations of any kind — it is pure
 * cryptographic verification over data the caller already has in hand
 * (typically the result of an `eth_getProof` call made elsewhere).
 *
 * A block *hash* identifies a block but is not itself a trie root — the
 * caller must supply the block's trusted `stateRoot` explicitly (e.g. from
 * a verified block header). This module never fetches a block header and
 * never accepts a block hash in place of a state root.
 *
 * @see https://eips.ethereum.org/EIPS/eip-1186
 * @see https://ethereum.github.io/yellowpaper/paper.pdf (Appendix D — Trie)
 */

import { fromRlp, getAddress, isHex, keccak256, toBytes, type Address, type Hex } from 'viem'
import { bytesToBigInt, decodeAccount, decodeHexPrefix, keyToNibbles, TrieEncodingError } from './rlp.js'

/** Root hash of an empty Merkle Patricia Trie: `keccak256(RLP(''))`. */
export const EMPTY_TRIE_ROOT: Hex = keccak256('0x80')

/** `keccak256` of empty code: the `codeHash` of an account with no contract code. */
export const EMPTY_CODE_HASH: Hex = keccak256('0x')

/** A single EIP-1186 storage-slot proof entry. */
export interface StorageProofInput {
  /** Storage slot key. Left-padded to 32 bytes if shorter; must not exceed 32 bytes. */
  key: Hex
  /** Claimed value at this slot. Compared canonically as an unsigned integer. */
  value: Hex | bigint | number
  /** RLP-encoded storage-trie nodes, root first, as returned by `eth_getProof`. */
  proof: readonly Hex[]
}

/** An EIP-1186 account proof, matching the shape returned by `eth_getProof`. */
export interface AccountProofInput {
  address: Address
  balance: bigint | number
  /** Account transaction count. Accepted as `number` (JSON-RPC quantity) or `bigint`. */
  nonce: number | bigint
  codeHash: Hex
  /** The account's storage-trie root. */
  storageHash: Hex
  /** RLP-encoded account-trie nodes, root first, as returned by `eth_getProof`. */
  accountProof: readonly Hex[]
  /** Optional per-slot storage proofs, verified against `storageHash`. */
  storageProof?: readonly StorageProofInput[]
}

/** Structured result of verifying a single account or storage proof. */
export type ProofVerificationResult =
  | { valid: true; kind: 'inclusion' | 'exclusion' }
  | { valid: false; reason: string }

/** Structured result of verifying a full EIP-1186 proof (account + all storage slots). */
export interface EIP1186VerificationResult {
  valid: boolean
  account: ProofVerificationResult
  storageProofs: { key: Hex; result: ProofVerificationResult }[]
}

// ---------------------------------------------------------------------------
// Denial-of-service guards. These bound proof size well above anything a real
// Ethereum trie can produce (max path depth is 64 nibbles; branch nodes are
// at most 17 * 32 bytes plus RLP overhead), so legitimate proofs are never
// rejected, while a maliciously oversized or deeply-nested input is.
// ---------------------------------------------------------------------------
const MAX_PROOF_NODES = 128
const MAX_NODE_BYTES = 1024
const MAX_TRAVERSAL_STEPS = 256

class ProofVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProofVerificationError'
  }
}

function hexToBytesStrict(value: Hex, fieldName: string): Uint8Array {
  if (!isHex(value)) {
    throw new ProofVerificationError(`${fieldName} must be 0x-prefixed hex`)
  }
  try {
    return toBytes(value)
  } catch (error) {
    throw new ProofVerificationError(`${fieldName} is not valid hex: ${(error as Error).message}`)
  }
}

/** Left-pads to 32 bytes; throws if the input already exceeds 32 bytes. */
function normalizeHash32(value: Hex, fieldName: string): Uint8Array {
  const bytes = hexToBytesStrict(value, fieldName)
  if (bytes.length > 32) {
    throw new ProofVerificationError(`${fieldName} exceeds 32 bytes`)
  }
  if (bytes.length === 32) return bytes
  const padded = new Uint8Array(32)
  padded.set(bytes, 32 - bytes.length)
  return padded
}

function toCanonicalBigInt(value: Hex | bigint | number, fieldName: string): bigint {
  if (typeof value === 'bigint') {
    if (value < 0n) throw new ProofVerificationError(`${fieldName} must not be negative`)
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      throw new ProofVerificationError(`${fieldName} must be a non-negative integer`)
    }
    return BigInt(value)
  }
  if (typeof value === 'string') {
    if (!isHex(value)) throw new ProofVerificationError(`${fieldName} must be 0x-prefixed hex`)
    return bytesToBigInt(toBytes(value))
  }
  throw new ProofVerificationError(`${fieldName} has an unsupported type`)
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function decodeProofNodes(proof: readonly Hex[], fieldName: string): Uint8Array[] {
  if (!Array.isArray(proof)) {
    throw new ProofVerificationError(`${fieldName} must be an array of hex-encoded trie nodes`)
  }
  if (proof.length > MAX_PROOF_NODES) {
    throw new ProofVerificationError(`${fieldName} has ${proof.length} nodes, exceeding the maximum of ${MAX_PROOF_NODES}`)
  }
  return proof.map((node, index) => {
    const bytes = hexToBytesStrict(node, `${fieldName}[${index}]`)
    if (bytes.length > MAX_NODE_BYTES) {
      throw new ProofVerificationError(`${fieldName}[${index}] is ${bytes.length} bytes, exceeding the maximum of ${MAX_NODE_BYTES}`)
    }
    return bytes
  })
}

type NodeRef = { kind: 'hash'; hash: Uint8Array } | { kind: 'embedded'; node: unknown[] }

function toNodeRef(child: unknown, context: string): NodeRef {
  if (Array.isArray(child)) return { kind: 'embedded', node: child }
  if (child instanceof Uint8Array) {
    if (child.length === 0) {
      throw new ProofVerificationError(`${context}: unexpected empty child reference`)
    }
    if (child.length !== 32) {
      throw new ProofVerificationError(`${context}: non-embedded child reference must be exactly 32 bytes`)
    }
    return { kind: 'hash', hash: child }
  }
  throw new ProofVerificationError(`${context}: invalid child reference type`)
}

function assertByteString(value: unknown, context: string): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new ProofVerificationError(`${context} must be an RLP byte string, not a nested list`)
  }
}

function decodeNode(nodeBytes: Uint8Array): unknown[] {
  let decoded: unknown
  try {
    decoded = fromRlp(nodeBytes, 'bytes')
  } catch (error) {
    throw new ProofVerificationError(`proof node is not valid RLP: ${(error as Error).message}`)
  }
  if (!Array.isArray(decoded)) {
    throw new ProofVerificationError('proof node must RLP-decode to a list')
  }
  return decoded
}

type TraversalResult = { outcome: 'included'; value: Uint8Array } | { outcome: 'excluded' }

/**
 * Walks a Merkle Patricia Trie proof from `rootHash` along `nibbles`,
 * verifying every hash link as it goes. Returns the raw leaf value on
 * inclusion, or an `excluded` outcome for a well-formed non-membership
 * proof. Throws {@link ProofVerificationError} for any structural defect
 * (hash mismatch, malformed RLP, oversized/cyclic input) — the caller is
 * responsible for turning that into a `{ valid: false, reason }` result.
 */
function traverseTrie(rootHash: Uint8Array, proofNodes: Uint8Array[], nibbles: number[]): TraversalResult {
  let ref: NodeRef = { kind: 'hash', hash: rootHash }
  let nibbleIndex = 0
  const cursor = { index: 0 }

  for (let step = 0; ; step++) {
    if (step > MAX_TRAVERSAL_STEPS) {
      throw new ProofVerificationError('proof traversal exceeded the maximum allowed number of steps')
    }

    let decoded: unknown[]
    if (ref.kind === 'embedded') {
      decoded = ref.node
    } else {
      if (cursor.index >= proofNodes.length) {
        // An empty trie has no backing node at all; its root is a fixed
        // constant, so an empty proof array against that root is a valid,
        // trivial exclusion proof rather than a malformed one.
        if (bytesEqual(ref.hash, toBytes(EMPTY_TRIE_ROOT))) {
          return { outcome: 'excluded' }
        }
        throw new ProofVerificationError('proof ended before the key path was resolved')
      }
      const nodeBytes = proofNodes[cursor.index]
      cursor.index += 1
      const actualHash = keccak256(nodeBytes, 'bytes')
      if (!bytesEqual(actualHash, ref.hash)) {
        throw new ProofVerificationError('proof node hash does not match the expected reference')
      }
      decoded = decodeNode(nodeBytes)
    }

    if (decoded.length === 17) {
      if (nibbleIndex === nibbles.length) {
        const value = decoded[16]
        assertByteString(value, 'branch value slot')
        return value.length === 0 ? { outcome: 'excluded' } : { outcome: 'included', value }
      }
      const nibble = nibbles[nibbleIndex]
      const child = decoded[nibble]
      if (child instanceof Uint8Array && child.length === 0) {
        return { outcome: 'excluded' }
      }
      nibbleIndex += 1
      ref = toNodeRef(child, `branch child [${nibble}]`)
      continue
    }

    if (decoded.length === 2) {
      const encodedPath = decoded[0]
      assertByteString(encodedPath, 'node path')
      const { nibbles: pathNibbles, isLeaf } = decodeHexPrefix(encodedPath)

      const remaining = nibbles.length - nibbleIndex
      if (pathNibbles.length > remaining) {
        return { outcome: 'excluded' }
      }
      for (let i = 0; i < pathNibbles.length; i++) {
        if (nibbles[nibbleIndex + i] !== pathNibbles[i]) {
          return { outcome: 'excluded' }
        }
      }
      nibbleIndex += pathNibbles.length

      const value = decoded[1]
      if (isLeaf) {
        if (nibbleIndex !== nibbles.length) {
          return { outcome: 'excluded' }
        }
        assertByteString(value, 'leaf value')
        return { outcome: 'included', value }
      }

      // Extension node: an extension always leads to a branch, so a key
      // path that ends exactly at the extension boundary is a prefix of
      // some other stored key, not a stored key itself.
      if (nibbleIndex === nibbles.length) {
        return { outcome: 'excluded' }
      }
      ref = toNodeRef(value, 'extension child')
      continue
    }

    throw new ProofVerificationError(`proof node has invalid arity: expected 2 or 17 items, got ${decoded.length}`)
  }
}

function toResult(
  fn: () => TraversalResult,
  onIncluded: (value: Uint8Array) => ProofVerificationResult,
  onExcluded: () => ProofVerificationResult = () => ({ valid: true, kind: 'exclusion' }),
): ProofVerificationResult {
  try {
    const result = fn()
    if (result.outcome === 'excluded') return onExcluded()
    return onIncluded(result.value)
  } catch (error) {
    if (error instanceof ProofVerificationError || error instanceof TrieEncodingError) {
      return { valid: false, reason: error.message }
    }
    throw error
  }
}

/**
 * Verifies an EIP-1186 account proof against a trusted `stateRoot`.
 *
 * On inclusion, the decoded on-chain `nonce`/`balance`/`codeHash`/`storageHash`
 * must exactly match the corresponding fields on `proof` — a mismatch is
 * reported as `{ valid: false }`, never silently ignored. On exclusion, the
 * proof establishes only that no account exists at `proof.address`; the
 * `balance`/`nonce`/`codeHash`/`storageHash` fields are not evaluated.
 */
export function verifyAccountProof(stateRoot: Hex, proof: AccountProofInput): ProofVerificationResult {
  return toResult(
    () => {
      const rootBytes = normalizeHash32(stateRoot, 'stateRoot')

      let address: Address
      try {
        address = getAddress(proof.address)
      } catch {
        throw new ProofVerificationError(`invalid account address: ${proof.address}`)
      }
      const keyHash = keccak256(toBytes(address), 'bytes')
      const nibbles = keyToNibbles(keyHash)

      const proofNodes = decodeProofNodes(proof.accountProof, 'accountProof')
      return traverseTrie(rootBytes, proofNodes, nibbles)
    },
    (value) => {
      const decoded = decodeAccount(value)
      const claimedNonce = toCanonicalBigInt(proof.nonce, 'nonce')
      const claimedBalance = toCanonicalBigInt(proof.balance, 'balance')
      const claimedCodeHash = normalizeHash32(proof.codeHash, 'codeHash')
      const claimedStorageHash = normalizeHash32(proof.storageHash, 'storageHash')

      if (decoded.nonce !== claimedNonce) {
        return { valid: false, reason: `nonce mismatch: proof has ${decoded.nonce}, claimed ${claimedNonce}` }
      }
      if (decoded.balance !== claimedBalance) {
        return { valid: false, reason: `balance mismatch: proof has ${decoded.balance}, claimed ${claimedBalance}` }
      }
      if (!bytesEqual(toBytes(decoded.codeHash), claimedCodeHash)) {
        return { valid: false, reason: 'codeHash mismatch between proof and claimed account' }
      }
      if (!bytesEqual(toBytes(decoded.storageRoot), claimedStorageHash)) {
        return { valid: false, reason: 'storageHash mismatch between proof and claimed account' }
      }
      return { valid: true, kind: 'inclusion' }
    },
  )
}

/**
 * Verifies a single EIP-1186 storage-slot proof against a trusted
 * `storageRoot` (the account's verified `storageHash`).
 *
 * `input.key` is normalized to a canonical 32-byte big-endian slot before
 * hashing. Values are compared as canonical unsigned integers — leading
 * zero bytes and RLP's minimal-integer encoding never cause a false
 * mismatch. A missing slot must be claimed as value `0`; any other claimed
 * value against a proof of absence is reported as invalid.
 */
export function verifyStorageProof(storageRoot: Hex, input: StorageProofInput): ProofVerificationResult {
  return toResult(
    () => {
      const rootBytes = normalizeHash32(storageRoot, 'storageRoot')
      const slotBytes = normalizeHash32(input.key, 'storage key')
      const keyHash = keccak256(slotBytes, 'bytes')
      const nibbles = keyToNibbles(keyHash)
      const proofNodes = decodeProofNodes(input.proof, 'storageProof.proof')
      return traverseTrie(rootBytes, proofNodes, nibbles)
    },
    (value) => {
      let innerBytes: unknown
      try {
        innerBytes = fromRlp(value, 'bytes')
      } catch (error) {
        return { valid: false, reason: `storage value is not valid RLP: ${(error as Error).message}` }
      }
      if (!(innerBytes instanceof Uint8Array)) {
        return { valid: false, reason: 'storage value must decode to a single RLP byte string' }
      }
      const decodedValue = bytesToBigInt(innerBytes)
      const claimedValue = toCanonicalBigInt(input.value, 'storage value')
      if (decodedValue !== claimedValue) {
        return { valid: false, reason: `storage value mismatch: proof has ${decodedValue}, claimed ${claimedValue}` }
      }
      return { valid: true, kind: 'inclusion' }
    },
    () => {
      // An absent slot is defined to hold value 0 — a proof of absence
      // combined with a non-zero claimed value is a contradiction, not a
      // valid exclusion.
      const claimedValue = toCanonicalBigInt(input.value, 'storage value')
      if (claimedValue !== 0n) {
        return { valid: false, reason: `proof shows slot is absent (value 0), but ${claimedValue} was claimed` }
      }
      return { valid: true, kind: 'exclusion' }
    },
  )
}

/**
 * Verifies a full EIP-1186 proof — the account proof against `stateRoot`,
 * and every `storageProof` entry against the account's verified
 * `storageHash` — in one call. Mirrors the exact response shape of
 * `eth_getProof` (and viem's `getProof` action), so a raw RPC response can
 * be passed through unmodified.
 */
export function verifyEIP1186Proof(stateRoot: Hex, proof: AccountProofInput): EIP1186VerificationResult {
  const account = verifyAccountProof(stateRoot, proof)
  const storageProofs = (proof.storageProof ?? []).map((entry) => ({
    key: entry.key,
    result: verifyStorageProof(proof.storageHash, entry),
  }))
  const valid = account.valid && storageProofs.every((entry) => entry.result.valid)
  return { valid, account, storageProofs }
}

/**
 * Boolean convenience wrapper around {@link verifyEIP1186Proof} for callers
 * who only need a pass/fail result.
 */
export function isValidStateProof(stateRoot: Hex, proof: AccountProofInput): boolean {
  return verifyEIP1186Proof(stateRoot, proof).valid
}
