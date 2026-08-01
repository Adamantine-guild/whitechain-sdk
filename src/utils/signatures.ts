/**
 * EIP-712 typed-data utilities for WhiteChain's gasless flows.
 *
 * The protocol authenticates gasless transactions (ERC-20 permits) and
 * identity assertions with EIP-712 signed messages. Structuring these
 * messages by hand is where integration bugs happen: a wrong domain
 * separator, a mis-ordered type array, or a non-normalized signature all
 * produce silent signature rejections on chain.
 *
 * This module centralises the protocol's standard EIP-712 domain variables
 * and exposes three building blocks:
 *
 *  - {@link buildPermitPayload} — assemble a complete, ready-to-sign
 *    EIP-712 permit payload (domain + types + message) that matches what
 *    the permit-enabled Whitelotus token contract expects on chain;
 *  - {@link hashPermitPayload} — the exact EIP-712 digest the contract
 *    recomputes in `permit()` (useful for backend bookkeeping or
 *    debugging a rejected signature);
 *  - {@link verifySignature} — independently recover the signer from
 *    `signature` and confirm it matches `expectedSigner` *before* the
 *    payload is broadcast, without any network I/O;
 *  - {@link recoverPermitSigner} — recover the raw signer address for
 *    tooling/identity flows.
 *
 * Security guarantees:
 *  - Verification is fully offline — it never touches an RPC endpoint.
 *  - Signatures are checked for ECDSA malleability: any signature whose
 *    `s` value is in the upper half of the secp256k1 curve order (the
 *    "high-s" form) is rejected with a {@link ValidationError}. The
 *    protocol's contracts only accept low-s signatures, so accepting the
 *    high-s variant would let an attacker substitute an equivalent
 *    signature for the same digest.
 *  - All inputs are validated eagerly with {@link ValidationError};
 *    malformed payloads or signatures fail fast instead of producing a
 *    confusing `false` result.
 *
 * @see https://eips.ethereum.org/EIPS/eip-712
 * @see https://eips.ethereum.org/EIPS/eip-2612
 */
import {
  hashTypedData,
  recoverTypedDataAddress,
  verifyTypedData,
  type Address,
  type Hex,
  type TypedDataDomain,
} from 'viem'
import { ValidationError } from '../errors/index.js'
import { assertValidAddress } from '../constants.js'
import { EIP2612_PERMIT_TYPES } from './permit.js'

/**
 * The protocol's standard EIP-712 domain variables.
 *
 * These mirror the values used by the permit-enabled Whitelotus token
 * contract. Every builder default derives from this object; pass explicit
 * overrides to {@link PermitDomainOptions} when interacting with a
 * different contract, chain, or domain version.
 */
export const WHITECHAIN_EIP712 = {
  /** Domain name of the protocol's permit-enabled token. */
  name: 'Whitelotus',
  /** Domain version of the protocol's EIP-712 domain. */
  version: '1',
  /** WhiteChain mainnet chain ID (see `src/config/networks.ts`). */
  chainId: 1875,
  /** WhiteChain testnet chain ID (see `src/config/networks.ts`). */
  testnetChainId: 2625,
} as const

/** The order `n` of the secp256k1 curve (used by the malleability guard). */
const SECP256K1_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n

/**
 * Half the secp256k1 curve order (`n / 2`).
 *
 * A valid ECDSA signature over secp256k1 has two equivalent forms: one with
 * `s` in `[1, n/2]` ("low-s", what Ethereum and the protocol's contracts
 * accept) and one with `s` in `(n/2, n)` ("high-s"). Rejecting high-s
 * signatures prevents signature malleability — the same digest can never be
 * replayed under a different, equally valid signature.
 */
export const SECP256K1_HALF_ORDER = SECP256K1_ORDER >> 1n

/**
 * Options that customise the EIP-712 domain of a permit payload.
 * Only `verifyingContract` is required; everything else defaults to the
 * protocol standard defined in {@link WHITECHAIN_EIP712}.
 */
export interface PermitDomainOptions {
  /**
   * The contract that verifies the permit (e.g. the Whitelotus token
   * address). This is the `verifyingContract` field of the domain and is
   * required — it anchors the signature to a specific contract.
   */
  verifyingContract: Address
  /** EIP-712 domain name. Defaults to the protocol value (`Whitelotus`). */
  name?: string
  /** EIP-712 domain version. Defaults to the protocol value (`1`). */
  version?: string
  /**
   * Chain ID the permit is valid on. Defaults to WhiteChain mainnet
   * (1875). Pass {@link WHITECHAIN_EIP712.testnetChainId} (2625) for
   * testnet deployments.
   */
  chainId?: number | bigint
}

/** The typed message of an EIP-2612-style permit. */
export interface PermitMessage {
  /** Address whose tokens are being approved. */
  owner: Address
  /** Address granted the allowance. */
  spender: Address
  /** Allowance amount, in wei (token base units). */
  value: bigint
  /** Current `nonces(owner)` value from the token contract. */
  nonce: bigint
  /** Unix timestamp (seconds) after which the permit expires. */
  deadline: bigint
}

/**
 * A complete, ready-to-sign EIP-712 permit payload.
 *
 * The shape matches viem's `signTypedData` / `verifyTypedData` /
 * `hashTypedData` expectations, so it can be passed to those functions
 * directly:
 *
 * ```ts
 * const signature = await account.signTypedData(payload)
 * ```
 */
export interface EIP712PermitPayload {
  /** The EIP-712 domain (name, version, chainId, verifyingContract). */
  domain: TypedDataDomain
  /** The EIP-2612 `Permit` type definitions. */
  types: typeof EIP2612_PERMIT_TYPES
  /** Primary type of the typed data. */
  primaryType: 'Permit'
  /** The permit fields being signed. */
  message: PermitMessage
}

const SIGNATURE_HEX_RE = /^0x[0-9a-fA-F]{130}$/
const R_S_HEX_RE = /^0x[0-9a-fA-F]{64}$/

/**
 * A signature supplied as a split `{ r, s, v }` object.
 *
 * `v` accepts both the 27/28 convention and the 0/1 yParity convention,
 * as either `number` or `bigint` — matching what viem, ethers, and
 * EIP-1193 providers return. The 0/1 forms are normalized to 27/28.
 */
export interface SignatureInput {
  /** 32-byte hex `r` value of the signature. */
  r: Hex
  /** 32-byte hex `s` value of the signature. */
  s: Hex
  /** Recovery value: 27/28 (Ethereum convention) or 0/1 (yParity). */
  v?: number | bigint
  /** Explicit yParity (0 or 1); takes precedence over `v` when both are given. */
  yParity?: number | bigint
}

/** Normalizes a uint256-typed input (`bigint`, integer `number`, or decimal/hex string) to a non-negative bigint. */
function toUint256(name: string, value: bigint | number | string): bigint {
  let v: bigint
  try {
    v = BigInt(value)
  } catch {
    throw new ValidationError(`${name} must be an integer, got ${String(value)}`)
  }
  if (v < 0n) {
    throw new ValidationError(`${name} must be non-negative, got ${v}`)
  }
  return v
}

/** Validates the address fields of a payload built by (or passed to) this module. */
function assertValidPayloadAddress(address: unknown, name: string): asserts address is Address {
  if (typeof address !== 'string') {
    throw new ValidationError(`${name} must be a 0x-prefixed address string, got ${typeof address}`)
  }
  assertValidAddress(address, name)
}

/** Validates a {@link PermitMessage} or a payload's message shape. */
function assertValidMessage(message: PermitMessage): void {
  assertValidPayloadAddress(message.owner, 'owner')
  assertValidPayloadAddress(message.spender, 'spender')
  if (typeof message.value !== 'bigint') {
    throw new ValidationError(`value must be a bigint, got ${typeof message.value}`)
  }
  if (message.value < 0n) {
    throw new ValidationError(`value must be non-negative, got ${message.value}`)
  }
  if (typeof message.nonce !== 'bigint') {
    throw new ValidationError(`nonce must be a bigint, got ${typeof message.nonce}`)
  }
  if (message.nonce < 0n) {
    throw new ValidationError(`nonce must be non-negative, got ${message.nonce}`)
  }
  if (typeof message.deadline !== 'bigint') {
    throw new ValidationError(`deadline must be a bigint, got ${typeof message.deadline}`)
  }
  if (message.deadline < 0n) {
    throw new ValidationError(`deadline must be non-negative, got ${message.deadline}`)
  }
}

/** Validates that `payload` is a well-formed EIP-712 permit payload before it is hashed or verified. */
function assertValidPayload(payload: EIP712PermitPayload): void {
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('payload must be an EIP-712 permit payload object')
  }
  if (!payload.domain || typeof payload.domain !== 'object') {
    throw new ValidationError('payload.domain is required')
  }
  assertValidPayloadAddress(payload.domain.verifyingContract, 'domain.verifyingContract')
  if (payload.primaryType !== 'Permit') {
    throw new ValidationError(`payload.primaryType must be 'Permit', got ${String(payload.primaryType)}`)
  }
  if (!payload.types || !Array.isArray(payload.types.Permit)) {
    throw new ValidationError('payload.types must contain a Permit type definition')
  }
  if (!payload.message || typeof payload.message !== 'object') {
    throw new ValidationError('payload.message is required')
  }
  assertValidMessage(payload.message)
}

/**
 * Assembles a complete EIP-712 permit payload for the protocol's
 * permit-enabled token contract.
 *
 * The returned payload matches the domain separator and `Permit` struct the
 * contract recomputes in `permit()`:
 *
 * ```ts
 * const payload = buildPermitPayload(owner, spender, value, deadline, nonce, {
 *   verifyingContract: tokenAddress,
 * })
 * const signature = await account.signTypedData(payload) // sign offline
 * const ok = verifySignature(payload, signature, owner)  // verify offline
 * ```
 *
 * @param owner - Address whose tokens are being approved (the signer).
 * @param spender - Address granted the allowance.
 * @param value - Allowance amount in wei. Accepts `bigint`, integer
 *   `number`, or decimal/hex string; normalized to `bigint`.
 * @param deadline - Unix timestamp (seconds) after which the permit
 *   expires. The builder does not enforce expiry — that is the contract's
 *   responsibility at execution time.
 * @param nonce - Current `nonces(owner)` value. Must match the token
 *   contract's on-chain counter or the permit is rejected.
 * @param domain - Domain configuration. `verifyingContract` is required;
 *   `name`, `version`, and `chainId` default to the protocol standard
 *   {@link WHITECHAIN_EIP712}.
 * @throws {ValidationError} if any address is malformed or any numeric
 *   field is negative / not an integer.
 */
export function buildPermitPayload(
  owner: Address,
  spender: Address,
  value: bigint | number | string,
  deadline: bigint | number | string,
  nonce: bigint | number | string,
  domain: PermitDomainOptions,
): EIP712PermitPayload {
  assertValidPayloadAddress(owner, 'owner')
  assertValidPayloadAddress(spender, 'spender')

  if (!domain || typeof domain !== 'object' || !domain.verifyingContract) {
    throw new ValidationError('domain.verifyingContract is required — the permit must be anchored to a contract')
  }
  assertValidPayloadAddress(domain.verifyingContract, 'domain.verifyingContract')

  const name = domain.name ?? WHITECHAIN_EIP712.name
  const version = domain.version ?? WHITECHAIN_EIP712.version
  const chainId = domain.chainId ?? WHITECHAIN_EIP712.chainId
  if (typeof chainId !== 'number' && typeof chainId !== 'bigint') {
    throw new ValidationError(`chainId must be a number or bigint, got ${typeof chainId}`)
  }

  const message: PermitMessage = {
    owner,
    spender,
    value: toUint256('value', value),
    nonce: toUint256('nonce', nonce),
    deadline: toUint256('deadline', deadline),
  }

  return {
    domain: {
      name,
      version,
      chainId,
      verifyingContract: domain.verifyingContract,
    },
    types: EIP2612_PERMIT_TYPES,
    primaryType: 'Permit',
    message,
  }
}

/**
 * Computes the EIP-712 digest of a permit payload — the exact
 * `keccak256("\x19\x01" ‖ domainSeparator ‖ structHash)` the contract
 * recomputes in `permit()`.
 *
 * Useful for debugging rejected signatures, building backend allow-lists,
 * or double-checking a payload before it is sent to a wallet.
 *
 * @throws {ValidationError} if the payload is malformed.
 */
export function hashPermitPayload(payload: EIP712PermitPayload): Hex {
  assertValidPayload(payload)
  return hashTypedData(payload)
}

/**
 * Parses and validates a signature, returning it as a normalized 65-byte
 * hex string with a low-s value.
 *
 * Accepts either a 65-byte hex signature (`0x` + 130 hex chars, v as the
 * final byte) or a viem {@link Signature} object (`{ r, s, v }`). v values
 * of 0/1 are accepted and normalized to 27/28 in the returned hex.
 *
 * Malleability guard: a signature whose `s` value exceeds `n/2` (high-s)
 * is rejected with a {@link ValidationError}, as is a signature with an
 * `r` or `s` of zero (invalid ECDSA).
 *
 * @throws {ValidationError} if the signature is not 65 bytes, has an
 *   invalid `v`, has a zero `r`/`s`, or is a high-s (malleable) signature.
 */
export function parseEip712Signature(signature: Hex | SignatureInput): { hex: Hex; r: bigint; s: bigint; v: number } {
  let hex: Hex

  if (typeof signature === 'string') {
    if (!SIGNATURE_HEX_RE.test(signature)) {
      throw new ValidationError(
        `signature must be a 65-byte (0x-prefixed, 130 hex char) string, got ${signature.length} chars`,
      )
    }
    hex = signature
  } else if (signature && typeof signature === 'object') {
    const { r, s, v, yParity } = signature
    if (typeof r !== 'string' || !R_S_HEX_RE.test(r)) {
      throw new ValidationError(`signature.r must be a 32-byte hex string, got ${String(r)}`)
    }
    if (typeof s !== 'string' || !R_S_HEX_RE.test(s)) {
      throw new ValidationError(`signature.s must be a 32-byte hex string, got ${String(s)}`)
    }
    const vOrParity = Number(yParity ?? v)
    if (![0, 1, 27, 28].includes(vOrParity)) {
      throw new ValidationError(`signature.v must be 0, 1, 27, or 28, got ${String(v ?? yParity)}`)
    }
    const vNormalized = vOrParity < 27 ? vOrParity + 27 : vOrParity
    hex = `0x${r.slice(2)}${s.slice(2)}${vNormalized.toString(16).padStart(2, '0')}`
  } else {
    throw new ValidationError('signature must be a hex string or a { r, s, v } object')
  }

  const r = BigInt(`0x${hex.slice(2, 66)}`)
  const s = BigInt(`0x${hex.slice(66, 130)}`)
  const vRaw = parseInt(hex.slice(130, 132), 16)

  if (![0, 1, 27, 28].includes(vRaw)) {
    throw new ValidationError(`signature.v must be 0, 1, 27, or 28, got ${vRaw}`)
  }
  const v = vRaw < 27 ? vRaw + 27 : vRaw

  // Reject degenerate signatures (r or s of zero are invalid ECDSA values).
  if (r === 0n) {
    throw new ValidationError('signature rejected: r is zero (invalid ECDSA signature)')
  }
  if (s === 0n) {
    throw new ValidationError('signature rejected: s is zero (invalid ECDSA signature)')
  }

  // Anti-malleability: reject high-s signatures outright.
  if (s > SECP256K1_HALF_ORDER) {
    throw new ValidationError(
      'signature rejected: high-s value (ECDSA malleability guard) — re-sign and verify the signature is low-s',
    )
  }

  // Normalize v into the 27/28 convention used by the protocol's contracts.
  const normalizedHex = `0x${hex.slice(2, 130)}${v.toString(16).padStart(2, '0')}` as Hex

  return { hex: normalizedHex, r, s, v }
}

/**
 * Independently verifies that `signature` is a valid EIP-712 signature over
 * `payload` produced by `expectedSigner` — entirely offline, before the
 * payload is broadcast to the backend.
 *
 * This is the recommended pre-flight check for gasless flows: build the
 * payload, have the user sign it, verify it here, and only then submit the
 * permit to the relayer/backend.
 *
 * ```ts
 * const ok = verifySignature(payload, signature, owner)
 * if (!ok) throw new Error('Signature does not match the expected signer')
 * ```
 *
 * @param payload - The EIP-712 permit payload that was signed.
 * @param signature - 65-byte hex signature or `{ r, s, v }` object.
 * @param expectedSigner - The address the signature must recover to.
 * @returns A promise resolving to `true` if the signature is valid and
 *   recovers to `expectedSigner`; `false` if the signature is well-formed
 *   but does not match (wrong signer, tampered message, wrong domain).
 * @throws {ValidationError} if the payload is malformed, the signature is
 *   malformed, or the signature is a high-s (malleable) variant.
 */
export async function verifySignature(
  payload: EIP712PermitPayload,
  signature: Hex | SignatureInput,
  expectedSigner: Address,
): Promise<boolean> {
  assertValidPayload(payload)
  assertValidPayloadAddress(expectedSigner, 'expectedSigner')
  const { hex } = parseEip712Signature(signature)

  return verifyTypedData({
    address: expectedSigner,
    domain: payload.domain,
    types: payload.types,
    primaryType: payload.primaryType,
    message: payload.message,
    signature: hex,
  })
}

/**
 * Recovers the address that produced `signature` over `payload`.
 *
 * Useful for identity flows and debugging — e.g. deriving the signer from a
 * received permit before deciding how to handle it.
 *
 * @returns A promise resolving to the recovered signer address.
 * @throws {ValidationError} if the payload or signature is malformed
 *   (including high-s signatures), or if recovery fails.
 */
export async function recoverPermitSigner(payload: EIP712PermitPayload, signature: Hex | SignatureInput): Promise<Address> {
  assertValidPayload(payload)
  const { hex } = parseEip712Signature(signature)

  return recoverTypedDataAddress({
    domain: payload.domain,
    types: payload.types,
    primaryType: payload.primaryType,
    message: payload.message,
    signature: hex,
  })
}
