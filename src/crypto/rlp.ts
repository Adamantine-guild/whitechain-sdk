/**
 * Merkle Patricia Trie encoding primitives used to verify Ethereum EIP-1186
 * state proofs (see `StateProver.ts`).
 *
 * These are the encoding-level building blocks only — nibble paths, the
 * compact "hex-prefix" scheme used for leaf/extension node paths, and the
 * RLP account structure. Trie traversal, hash verification, and the public
 * verification API live in `StateProver.ts`.
 *
 * @see https://ethereum.github.io/yellowpaper/paper.pdf (Appendix D — Trie)
 * @see https://eips.ethereum.org/EIPS/eip-1186
 */

import { fromRlp, type Hex } from 'viem'

/** Thrown for structurally invalid trie encodings. Callers should treat this as "malformed proof". */
export class TrieEncodingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TrieEncodingError'
  }
}

/** Splits raw key bytes into an array of 4-bit nibbles (2 nibbles per byte, high nibble first). */
export function keyToNibbles(key: Uint8Array): number[] {
  const nibbles = new Array<number>(key.length * 2)
  for (let i = 0; i < key.length; i++) {
    nibbles[i * 2] = key[i] >> 4
    nibbles[i * 2 + 1] = key[i] & 0x0f
  }
  return nibbles
}

/** A decoded compact ("hex-prefix") path, as used by leaf and extension node encodings. */
export interface HexPrefixPath {
  nibbles: number[]
  isLeaf: boolean
}

/**
 * Decodes the compact hex-prefix encoding used for leaf/extension node paths.
 * The first nibble of the first byte carries two flag bits: bit 1 (value 2)
 * marks a leaf vs. extension node, bit 0 (value 1) marks an odd nibble count.
 * An odd-length path's first real nibble is packed into the low nibble of
 * the flag byte; an even-length path has that low nibble as padding (0).
 */
export function decodeHexPrefix(encoded: Uint8Array): HexPrefixPath {
  if (encoded.length === 0) {
    throw new TrieEncodingError('compact-encoded path must not be empty')
  }

  const flag = encoded[0] >> 4
  if (flag > 3) {
    throw new TrieEncodingError(`invalid hex-prefix flag nibble: ${flag}`)
  }

  const isLeaf = (flag & 0b10) !== 0
  const isOdd = (flag & 0b01) !== 0

  const nibbles: number[] = []
  if (isOdd) {
    nibbles.push(encoded[0] & 0x0f)
  } else if ((encoded[0] & 0x0f) !== 0) {
    throw new TrieEncodingError('even-length hex-prefix path must have a zero padding nibble')
  }

  for (let i = 1; i < encoded.length; i++) {
    nibbles.push(encoded[i] >> 4, encoded[i] & 0x0f)
  }

  return { nibbles, isLeaf }
}

/** A decoded Ethereum account, as stored at an account-trie leaf. */
export interface DecodedAccount {
  nonce: bigint
  balance: bigint
  storageRoot: Hex
  codeHash: Hex
}

/**
 * Converts big-endian bytes to an unsigned bigint, treating a zero-length
 * array as `0`. Unlike viem's `bytesToBigInt`/`hexToBigInt` (which throw on
 * an empty input via `BigInt('0x')`), this must succeed on empty input:
 * RLP encodes the integer `0` as a zero-length byte string, which is a
 * routine, valid value in both account and storage trie leaves.
 */
export function bytesToBigInt(bytes: Uint8Array): bigint {
  if (bytes.length === 0) return 0n
  let hex = '0x'
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return BigInt(hex)
}

function bytesToHash32(bytes: Uint8Array, fieldName: string): Hex {
  if (bytes.length > 32) {
    throw new TrieEncodingError(`${fieldName} exceeds 32 bytes`)
  }
  let hex = '0x'
  for (let i = 0; i < 32 - bytes.length; i++) hex += '00'
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex as Hex
}

/**
 * Decodes an RLP-encoded account leaf value into its four fields.
 * @throws {TrieEncodingError} if the RLP does not decode to a 4-item list of byte strings.
 */
export function decodeAccount(rlpAccount: Uint8Array): DecodedAccount {
  let decoded: unknown
  try {
    decoded = fromRlp(rlpAccount, 'bytes')
  } catch (error) {
    throw new TrieEncodingError(`account value is not valid RLP: ${(error as Error).message}`)
  }

  if (!Array.isArray(decoded) || decoded.length !== 4) {
    throw new TrieEncodingError('account value must be an RLP list of 4 items [nonce, balance, storageRoot, codeHash]')
  }

  const [nonceBytes, balanceBytes, storageRootBytes, codeHashBytes] = decoded
  for (const item of [nonceBytes, balanceBytes, storageRootBytes, codeHashBytes]) {
    if (!(item instanceof Uint8Array)) {
      throw new TrieEncodingError('account fields must be RLP byte strings, not nested lists')
    }
  }

  return {
    nonce: bytesToBigInt(nonceBytes as Uint8Array),
    balance: bytesToBigInt(balanceBytes as Uint8Array),
    storageRoot: bytesToHash32(storageRootBytes as Uint8Array, 'storageRoot'),
    codeHash: bytesToHash32(codeHashBytes as Uint8Array, 'codeHash'),
  }
}
