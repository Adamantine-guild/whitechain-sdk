import { SdkErrorCode } from './codes.js'
import {
  SDKError,
  TransactionExecutionError,
} from './SDKError.js'

// Re-export hierarchy roots so existing `from './WhitechainErrors.js'` imports keep working.
export { SDKError } from './SDKError.js'
export {
  WalletSignerError,
  TransactionExecutionError,
  RPCNodeError,
} from './SDKError.js'

/**
 * Thrown when a transaction is reverted but the revert reason or custom error
 * cannot be explicitly mapped to a specific typed error.
 */
export class TransactionRevertedError extends TransactionExecutionError {
  public readonly reason?: string
  public readonly args?: readonly unknown[]

  constructor(
    message: string,
    reason?: string,
    args?: readonly unknown[],
    code: SdkErrorCode = SdkErrorCode.CONTRACT_REVERT,
  ) {
    super(message, {
      code,
      revertReason: reason,
      context: { revertReason: reason },
    })
    this.name = 'TransactionRevertedError'
    this.reason = reason
    this.args = args
  }
}

/**
 * Thrown when an RPC call or transaction response explicitly reports a smart
 * contract revert.
 */
export class ContractRevertError extends TransactionRevertedError {
  public readonly rawData?: unknown
  public readonly rpcCode?: number
  public readonly customErrorName?: string

  constructor(options: {
    message: string
    reason?: string
    rawData?: unknown
    rpcCode?: number
    customErrorName?: string
    args?: readonly unknown[]
    contractAddress?: string
    transactionHash?: string
  }) {
    super(options.message, options.reason, options.args, SdkErrorCode.CONTRACT_REVERT)
    this.name = 'ContractRevertError'
    this.rawData = options.rawData
    this.rpcCode = options.rpcCode
    this.customErrorName = options.customErrorName
    if (options.contractAddress) {
      this.context.contractAddress = options.contractAddress
    }
    if (options.transactionHash) {
      this.context.transactionHash = options.transactionHash
    }
    if (options.rpcCode !== undefined) {
      this.context.rpcCode = options.rpcCode
    }
  }
}

/**
 * Fallback for unparseable or unknown transaction errors.
 */
export class UnknownTransactionError extends SDKError {
  public readonly originalError: unknown

  constructor(message: string, originalError: unknown) {
    super(message, {
      code: SdkErrorCode.UNKNOWN,
      cause: originalError,
    })
    this.name = 'UnknownTransactionError'
    this.originalError = originalError
  }
}

/**
 * Thrown when a user does not have enough balance to perform the action.
 */
export class InsufficientBalanceError extends TransactionRevertedError {
  constructor(args?: readonly unknown[]) {
    super(
      'Insufficient balance for the transaction.',
      'InsufficientBalance',
      args,
      SdkErrorCode.INSUFFICIENT_BALANCE,
    )
    this.name = 'InsufficientBalanceError'
  }
}

/**
 * Thrown when a user is not authorized to perform the action.
 */
export class UnauthorizedError extends TransactionRevertedError {
  constructor(args?: readonly unknown[]) {
    super(
      'Not authorized to perform this action.',
      'Unauthorized',
      args,
      SdkErrorCode.UNAUTHORIZED,
    )
    this.name = 'UnauthorizedError'
  }
}
