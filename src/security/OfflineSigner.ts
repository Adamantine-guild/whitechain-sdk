/**
 * Air-gapped Ethereum-compatible transaction signing for cold storage.
 *
 * `OfflineSigner` constructs and signs legacy and EIP-1559 transactions using
 * only values supplied directly by the caller. This module has zero network
 * dependencies:
 *
 *  - it does not accept a provider, transport, public client, wallet client,
 *    RPC URL, chain RPC configuration, or SDK context of any kind;
 *  - it never calls `fetch`, `XMLHttpRequest`, `WebSocket`, an HTTP library,
 *    a viem client action, or a network-discovery function;
 *  - it never calls `getNetwork`, `getChainId`, `getTransactionCount`,
 *    `estimateGas`, `getGasPrice`, `estimateFeesPerGas`,
 *    `prepareTransactionRequest`, or any other helper that could silently
 *    fill in a missing field via RPC.
 *
 * Every value needed to sign — `nonce`, `chainId`, `gas`, `to`, `value`,
 * `data`, and the fee fields for the chosen transaction type — must be
 * supplied by the caller. There is no fallback and no lookup: a missing or
 * invalid field always fails immediately and locally via {@link ValidationError}.
 *
 * The three-stage air-gapped workflow this module is designed for:
 *  1. **Online preparation**: on an internet-connected machine, look up the
 *     nonce, chain ID, gas limit, and fee data, then assemble an
 *     {@link OfflineTransaction}. Only this unsigned data crosses over to
 *     the offline machine.
 *  2. **Offline signing** (this module): on the air-gapped machine, provide
 *     the private key to {@link OfflineSigner}, sign using only the
 *     manually supplied values, and export the resulting {@link raw} hex.
 *     The private key never leaves this machine.
 *  3. **Online broadcast**: transfer only the signed {@link raw} hex back to
 *     an online machine and submit it via `eth_sendRawTransaction`. A
 *     signed transaction can still fail at this stage if the nonce, fees,
 *     account balance, or chain state changed since stage 1.
 *
 * Security note: this module guarantees the *signing step* performs no
 * network I/O. It cannot guarantee the security of the surrounding
 * environment — the operating system, removable media used to transfer
 * data, where/how the private key is stored, or the transfer process
 * itself all remain the caller's responsibility.
 *
 * @see https://eips.ethereum.org/EIPS/eip-1559
 */

import {
  keccak256,
  parseTransaction,
  type Address,
  type Hex,
  type TransactionSerializable,
  type TransactionSerializableEIP1559,
  type TransactionSerializableLegacy,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ValidationError } from '../errors/index.js'
import { assertChecksumAddress } from '../utils/address.js'

/** Fields common to both supported offline transaction shapes. */
interface OfflineTransactionBase {
  /** EIP-155 chain ID the transaction is valid on. */
  chainId: number
  /** Account nonce. Must be supplied by the caller — never fetched. */
  nonce: number
  /** Recipient address, or `null`/omitted for a contract-creation transaction. */
  to?: Address | null
  /** Value to transfer, in wei. Defaults to `0n`. */
  value?: bigint
  /** Call data / contract creation code. Defaults to `'0x'`. */
  data?: Hex
  /** Gas limit for the transaction. Must be a positive bigint, supplied by the caller — never estimated. */
  gas: bigint
}

/** A pre-EIP-1559 (type 0) transaction, priced with a flat `gasPrice`. */
export interface OfflineLegacyTransaction extends OfflineTransactionBase {
  type?: 'legacy'
  /** Price per unit of gas, in wei. Must be supplied by the caller — never fetched. */
  gasPrice: bigint
}

/** An EIP-1559 (type 2) transaction, priced with fee-market fields. */
export interface OfflineEip1559Transaction extends OfflineTransactionBase {
  type: 'eip1559'
  /** Maximum total fee per unit of gas (base fee + priority fee), in wei. */
  maxFeePerGas: bigint
  /**
   * Maximum priority fee (tip) per unit of gas, in wei. Required — an
   * air-gapped signer has no RPC to derive a safe default from, so this
   * must be an explicit, deliberate choice by the caller.
   */
  maxPriorityFeePerGas: bigint
}

/** A transaction ready to be signed entirely offline. */
export type OfflineTransaction = OfflineLegacyTransaction | OfflineEip1559Transaction

/** The result of signing an {@link OfflineTransaction}. */
export interface SignedOfflineTransaction {
  /**
   * The fully serialized, signed transaction as raw hex. Pass this directly
   * to `eth_sendRawTransaction` (or `publicClient.sendRawTransaction`) on
   * any online node to broadcast it.
   */
  raw: Hex
  /** keccak256 hash of {@link raw} — matches the hash `eth_sendRawTransaction` returns. */
  hash: Hex
  /** The address that produced the signature, derived from the private key. */
  from: Address
}

const HEX_DATA_RE = /^0x([0-9a-fA-F]{2})*$/
const PRIVATE_KEY_HEX_RE = /^0x[0-9a-fA-F]{64}$/

function normalizePrivateKey(privateKey: Hex | Uint8Array): Hex {
  if (typeof privateKey === 'string') {
    if (!PRIVATE_KEY_HEX_RE.test(privateKey)) {
      throw new ValidationError('privateKey must be a 32-byte hex string (0x-prefixed, 64 hex chars)')
    }
    return privateKey as Hex
  }
  if (privateKey instanceof Uint8Array) {
    if (privateKey.length !== 32) {
      throw new ValidationError(`privateKey must be 32 bytes, got ${privateKey.length}`)
    }
    const hex = Array.from(privateKey, (b) => b.toString(16).padStart(2, '0')).join('')
    return `0x${hex}` as Hex
  }
  throw new ValidationError('privateKey must be a hex string or Uint8Array')
}

function assertSafeInteger(name: string, value: number): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new ValidationError(`${name} must be a safe integer, got ${String(value)}`)
  }
}

function assertPositiveSafeInteger(name: string, value: number): void {
  assertSafeInteger(name, value)
  if (value <= 0) {
    throw new ValidationError(`${name} must be a positive integer, got ${value}`)
  }
}

function assertNonNegativeSafeInteger(name: string, value: number): void {
  assertSafeInteger(name, value)
  if (value < 0) {
    throw new ValidationError(`${name} must be a non-negative integer, got ${value}`)
  }
}

function assertNonNegativeBigInt(name: string, value: bigint): void {
  if (typeof value !== 'bigint') {
    throw new ValidationError(`${name} must be a bigint, got ${typeof value}`)
  }
  if (value < 0n) {
    throw new ValidationError(`${name} must be non-negative, got ${value}`)
  }
}

function assertPositiveBigInt(name: string, value: bigint): void {
  if (typeof value !== 'bigint') {
    throw new ValidationError(`${name} must be a bigint, got ${typeof value}`)
  }
  if (value <= 0n) {
    throw new ValidationError(`${name} must be positive, got ${value}`)
  }
}

function assertValidData(data: Hex): void {
  if (!HEX_DATA_RE.test(data)) {
    throw new ValidationError(`data must be a 0x-prefixed hex string with an even number of digits, got ${data}`)
  }
}

/**
 * Validates `to` is a structurally valid 20-byte address. Plain lowercase
 * or uppercase addresses (no checksum) are accepted as-is; mixed-case
 * addresses must carry a *correct* EIP-55 checksum, catching the common
 * typo of a single flipped character before it becomes an irreversible
 * mistake.
 */
function assertValidToAddress(to: string): void {
  if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
    throw new ValidationError(`to is not a valid address: ${to}`)
  }
  const lower = to.toLowerCase()
  const upper = to.toUpperCase().replace('X', 'x')
  const isMixedCase = to !== lower && to !== upper
  if (isMixedCase) {
    assertChecksumAddress(to, 'to')
  }
}

/**
 * Validates an {@link OfflineTransaction} and normalizes its optional fields.
 * @throws {ValidationError} if any field is missing, malformed, or inconsistent.
 */
function validateTransaction(tx: OfflineTransaction): Required<Pick<OfflineTransactionBase, 'to' | 'value' | 'data'>> {
  assertPositiveSafeInteger('chainId', tx.chainId)
  assertNonNegativeSafeInteger('nonce', tx.nonce)
  assertPositiveBigInt('gas', tx.gas)

  const to = tx.to ?? null
  if (to !== null) {
    assertValidToAddress(to)
  }

  const value = tx.value ?? 0n
  assertNonNegativeBigInt('value', value)

  const data = tx.data ?? '0x'
  assertValidData(data)

  if (tx.type === 'eip1559') {
    assertNonNegativeBigInt('maxFeePerGas', tx.maxFeePerGas)
    assertNonNegativeBigInt('maxPriorityFeePerGas', tx.maxPriorityFeePerGas)
    if (tx.maxPriorityFeePerGas > tx.maxFeePerGas) {
      throw new ValidationError('maxPriorityFeePerGas must not exceed maxFeePerGas')
    }
  } else {
    assertNonNegativeBigInt('gasPrice', tx.gasPrice)
  }

  return { to, value, data }
}

function toSerializable(tx: OfflineTransaction): TransactionSerializable {
  const { to, value, data } = validateTransaction(tx)

  if (tx.type === 'eip1559') {
    const serializable: TransactionSerializableEIP1559 = {
      type: 'eip1559',
      chainId: tx.chainId,
      nonce: tx.nonce,
      to,
      value,
      data,
      gas: tx.gas,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    }
    return serializable
  }

  const serializable: TransactionSerializableLegacy = {
    type: 'legacy',
    chainId: tx.chainId,
    nonce: tx.nonce,
    to,
    value,
    data,
    gas: tx.gas,
    gasPrice: tx.gasPrice,
  }
  return serializable
}

/**
 * Signs an {@link OfflineTransaction} with `privateKey`, entirely offline.
 *
 * All transaction fields (nonce, gas, fees, chain ID) must be supplied by
 * the caller — this function never reads them from a node. It performs no
 * network I/O of any kind.
 *
 * @throws {ValidationError} if `privateKey` or any transaction field is invalid.
 */
export async function signOfflineTransaction(
  privateKey: Hex | Uint8Array,
  tx: OfflineTransaction,
): Promise<SignedOfflineTransaction> {
  const normalizedKey = normalizePrivateKey(privateKey)
  const serializable = toSerializable(tx)
  const account = privateKeyToAccount(normalizedKey)

  const raw = await account.signTransaction(serializable)
  const hash = keccak256(raw)

  return { raw, hash, from: account.address }
}

/**
 * A dedicated, air-gapped transaction signer for cold storage use.
 *
 * Construct with a private key; the key is held in memory only for the
 * lifetime of the instance and is never transmitted or logged.
 * {@link signTransaction} performs no network I/O — every value it needs
 * (nonce, gas limit, fees, chain ID) must be supplied by the caller.
 */
export class OfflineSigner {
  /** The address corresponding to this signer's private key. */
  public readonly address: Address

  private readonly privateKey: Hex

  constructor(privateKey: Hex | Uint8Array) {
    this.privateKey = normalizePrivateKey(privateKey)
    this.address = privateKeyToAccount(this.privateKey).address
  }

  /**
   * Signs `tx` and returns the serialized raw transaction, ready to be
   * broadcast by a separate, online node via `eth_sendRawTransaction`.
   *
   * Performs no network I/O — `tx` must already contain the nonce, gas
   * limit, fee fields, and chain ID; none of them are looked up here.
   *
   * @throws {ValidationError} if any field of `tx` is invalid.
   */
  async signTransaction(tx: OfflineTransaction): Promise<SignedOfflineTransaction> {
    return signOfflineTransaction(this.privateKey, tx)
  }
}

/** Re-exported for convenience when recovering/inspecting a signed payload in tests or tooling. */
export { parseTransaction }
