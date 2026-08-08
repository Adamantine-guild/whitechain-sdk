import {
  WhiteChainError,
  WhitechainSDKError,
  type SdkErrorContext,
} from '../errors/BaseError.js'
import { SdkErrorCode } from '../errors/codes.js'
import {
  WalletSignerError,
  TransactionExecutionError,
  RPCNodeError,
} from '../errors/SDKError.js'
import {
  ContractRevertError,
  InsufficientBalanceError,
  TransactionRevertedError,
  UnknownTransactionError,
} from '../errors/WhitechainErrors.js'
import { TimeoutError } from '../errors/TimeoutError.js'
import { ValidationError } from '../errors/ValidationError.js'
import { RpcError } from '../errors/RpcError.js'

const USER_REJECT_RE =
  /user rejected|user denied|rejected the request|user refused|ACTION_REJECTED|4001/i

const REVERT_RE = /execution reverted(?::\s*)?(.*)$/i
const INSUFFICIENT_RE = /insufficient (funds|balance)/i
const TIMEOUT_RE = /timeout|timed out|ETIMEDOUT/i
const NETWORK_RE = /ECONNRESET|ECONNREFUSED|network|fetch failed|socket hang up|502|503|504|429/i

/**
 * Normalize a raw error (string, Error, RPC payload) into a typed SDK error.
 * Preserves the original stack when wrapping an Error instance.
 */
export function decodeError(
  error: unknown,
  extras: SdkErrorContext = {},
): WhiteChainError {
  if (error instanceof WhiteChainError) {
    return error
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof error === 'object' && error && 'message' in error
          ? String((error as any).message)
          : 'Unknown error'

  // User rejection / wallet
  if (USER_REJECT_RE.test(message) || (error as any)?.code === 4001) {
    return new WalletSignerError(message, {
      userRejected: true,
      cause: error,
      context: extras,
    })
  }

  // Timeout
  if (TIMEOUT_RE.test(message) || (error as any)?.code === 'ETIMEDOUT') {
    return new TimeoutError(message)
  }

  // Network / RPC node
  if (
    NETWORK_RE.test(message) ||
    typeof (error as any)?.status === 'number' ||
    typeof (error as any)?.statusCode === 'number'
  ) {
    const status = (error as any)?.status ?? (error as any)?.statusCode
    return new RPCNodeError(message, {
      status,
      method: extras.method,
      cause: error,
      context: extras,
      responseBody: (error as any)?.responseBody ?? (error as any)?.body,
    })
  }

  // Contract revert (check before bare "insufficient balance" so revert reasons stay typed)
  const revertMatch = message.match(REVERT_RE)
  if (revertMatch) {
    const reason = (revertMatch[1] || extras.revertReason || '').trim() || undefined
    // Map known balance reverts to the dedicated subclass
    if (reason && INSUFFICIENT_RE.test(reason)) {
      return new InsufficientBalanceError()
    }
    return new ContractRevertError({
      message,
      reason,
      contractAddress: extras.contractAddress as string | undefined,
      transactionHash: extras.transactionHash as string | undefined,
      rpcCode: extras.rpcCode as number | undefined,
      rawData: extras.errorCode,
    })
  }

  // Insufficient balance (non-revert wording, e.g. eth_sendTransaction preflight)
  if (INSUFFICIENT_RE.test(message)) {
    const err = new InsufficientBalanceError()
    if (error instanceof Error && error.stack) {
      err.stack = error.stack
    }
    return err
  }

  // Generic transaction failure if a hash was provided
  if (extras.transactionHash) {
    return new TransactionExecutionError(message, {
      transactionHash: extras.transactionHash as string,
      contractAddress: extras.contractAddress as string | undefined,
      revertReason: extras.revertReason as string | undefined,
      cause: error,
      context: extras,
    })
  }

  if (error instanceof Error) {
    return new UnknownTransactionError(message, error)
  }

  return new WhitechainSDKError(message, {
    code: SdkErrorCode.UNKNOWN,
    cause: error,
    context: extras,
  })
}

/**
 * Extract a human-readable revert reason from a raw error message or object.
 */
export function extractRevertReason(error: unknown): string | undefined {
  if (error instanceof ContractRevertError || error instanceof TransactionRevertedError) {
    return (error.reason ?? error.revertReason) || undefined
  }
  if (error instanceof TransactionExecutionError) {
    return error.revertReason || undefined
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''
  const match = message.match(/execution reverted(?::\s*)?(.*)$/i)
  const reason = match?.[1]?.trim()
  return reason || undefined
}

/**
 * True when the error represents an end-user wallet rejection.
 */
export function isUserRejection(error: unknown): boolean {
  if (error instanceof WalletSignerError) return error.userRejected
  const message = error instanceof Error ? error.message : String(error ?? '')
  return USER_REJECT_RE.test(message) || (error as any)?.code === 4001
}

/**
 * Map legacy RpcError / TimeoutError / ValidationError into the hierarchy codes.
 * Useful when bridging older call sites.
 */
export function ensureSdkError(error: unknown): WhiteChainError {
  // Upgrade legacy RpcError into the hierarchy's RPCNodeError
  if (error instanceof RpcError) {
    return new RPCNodeError(error.message, {
      status: error.status,
      responseBody: error.responseBody,
      cause: error,
    })
  }
  if (error instanceof WhiteChainError) return error
  if (error instanceof TimeoutError) {
    return new TimeoutError(error.message)
  }
  if (error instanceof ValidationError) {
    return error
  }
  return decodeError(error)
}
