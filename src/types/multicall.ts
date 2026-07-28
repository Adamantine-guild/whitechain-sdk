import type { Address, Hex, PublicClient } from 'viem'
import type { WhiteChainError } from '../types.js'

/**
 * A single call payload to be batched via Multicall3.
 */
export type MulticallCall<T = any> = {
  /** The target contract address for the view call. */
  target: Address
  /** The encoded ABI function call payload. */
  callData: Hex
  /**
   * If true (default: true), a revert in this specific call will not cause the
   * overall batch to revert.
   */
  allowFailure?: boolean
  /**
   * Optional decoder function to convert returned `Hex` bytes into a typed object.
   */
  decoder?: (returnData: Hex) => T
}

/**
 * The result of a single call batched via Multicall3.
 */
export type MulticallResult<T = any> = {
  /** Whether the specific call succeeded on-chain. */
  success: boolean
  /** The decoded return data if successful and decoder returned, otherwise raw Hex or null. */
  data: T | null
  /** The raw returned bytes from the call execution. */
  returnData: Hex
  /** Error object if the call reverted or decoding failed. */
  error?: WhiteChainError | Error
}

/**
 * Options for configuring Multicall3 execution.
 */
export type MulticallOptions = {
  /** Override the Multicall3 contract address. */
  multicallAddress?: Address
  /** PublicClient instance to execute the eth_call request. */
  publicClient?: PublicClient
  /** Default allowFailure setting for calls in this batch if call.allowFailure is omitted. */
  allowFailure?: boolean
}
