/**
 * Stable machine-readable error codes for WhiteChain SDK domain errors.
 * Clients can switch on `error.code` without parsing free-form messages.
 */
export enum SdkErrorCode {
  /** Generic / unclassified SDK failure. */
  UNKNOWN = 'WHITECHAIN_UNKNOWN',
  /** Invalid arguments or preconditions failed. */
  VALIDATION = 'WHITECHAIN_VALIDATION',
  /** Wallet / signer rejected or failed (e.g. user rejected in MetaMask). */
  WALLET_SIGNER = 'WHITECHAIN_WALLET_SIGNER',
  /** Transaction was submitted but execution reverted or failed on-chain. */
  TRANSACTION_EXECUTION = 'WHITECHAIN_TX_EXECUTION',
  /** RPC / node transport failure (timeout, 5xx, connection drop). */
  RPC_NODE = 'WHITECHAIN_RPC_NODE',
  /** Insufficient native or token balance. */
  INSUFFICIENT_BALANCE = 'WHITECHAIN_INSUFFICIENT_BALANCE',
  /** Caller is not authorized for the action. */
  UNAUTHORIZED = 'WHITECHAIN_UNAUTHORIZED',
  /** Operation timed out waiting for a receipt or response. */
  TIMEOUT = 'WHITECHAIN_TIMEOUT',
  /** Contract revert with optional decoded reason. */
  CONTRACT_REVERT = 'WHITECHAIN_CONTRACT_REVERT',
}

export type SdkErrorCodeValue = `${SdkErrorCode}` | SdkErrorCode
