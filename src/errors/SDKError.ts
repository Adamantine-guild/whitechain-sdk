import { WhiteChainError, type SdkErrorContext, type WhitechainSDKErrorOptions } from './BaseError.js'
import { SdkErrorCode } from './codes.js'

/**
 * Root of the typed SDK error hierarchy (extends WhiteChainError).
 * Prefer specific subclasses in catch blocks.
 */
export class SDKError extends WhiteChainError {
  constructor(message: string, options: WhitechainSDKErrorOptions = {}) {
    // Put ...options first so explicit defaults (code) win over missing fields.
    super(message, {
      ...options,
      code: options.code ?? SdkErrorCode.UNKNOWN,
    })
    this.name = 'SDKError'
  }
}

export interface WalletSignerErrorOptions extends WhitechainSDKErrorOptions {
  /** True when the end-user rejected the request in their wallet UI. */
  userRejected?: boolean
}

/**
 * Wallet / signer failures (signature request rejected, missing account, etc.).
 */
export class WalletSignerError extends SDKError {
  public readonly userRejected: boolean

  constructor(message: string, options: WalletSignerErrorOptions = {}) {
    super(message, {
      ...options,
      code: SdkErrorCode.WALLET_SIGNER,
    })
    this.name = 'WalletSignerError'
    this.userRejected = options.userRejected ?? /reject|denied|user refused/i.test(message)
  }
}

export interface TransactionExecutionErrorOptions extends WhitechainSDKErrorOptions {
  transactionHash?: string
  contractAddress?: string
  revertReason?: string
}

/**
 * On-chain execution failures (reverts, failed receipts, gas issues).
 */
export class TransactionExecutionError extends SDKError {
  public readonly transactionHash?: string
  public readonly contractAddress?: string
  public readonly revertReason?: string

  constructor(message: string, options: TransactionExecutionErrorOptions = {}) {
    const context: SdkErrorContext = {
      ...options.context,
      transactionHash: options.transactionHash ?? options.context?.transactionHash,
      contractAddress: options.contractAddress ?? options.context?.contractAddress,
      revertReason: options.revertReason ?? options.context?.revertReason,
    }
    super(message, {
      ...options,
      context,
      code: options.code ?? SdkErrorCode.TRANSACTION_EXECUTION,
    })
    this.name = 'TransactionExecutionError'
    this.transactionHash = context.transactionHash as string | undefined
    this.contractAddress = context.contractAddress as string | undefined
    this.revertReason = context.revertReason as string | undefined
  }
}

export interface RPCNodeErrorOptions extends WhitechainSDKErrorOptions {
  status?: number
  rpcCode?: number
  method?: string
  responseBody?: unknown
}

/**
 * Transport / node-level failures (HTTP 5xx, timeouts, connection resets).
 */
export class RPCNodeError extends SDKError {
  public readonly status?: number
  public readonly rpcCode?: number
  public readonly method?: string
  public readonly responseBody?: unknown

  constructor(message: string, options: RPCNodeErrorOptions = {}) {
    const context: SdkErrorContext = {
      ...options.context,
      status: options.status ?? options.context?.status,
      rpcCode: options.rpcCode ?? options.context?.rpcCode,
      method: options.method ?? options.context?.method,
    }
    super(message, {
      ...options,
      context,
      code: SdkErrorCode.RPC_NODE,
    })
    this.name = 'RPCNodeError'
    this.status = context.status as number | undefined
    this.rpcCode = context.rpcCode as number | undefined
    this.method = context.method as string | undefined
    this.responseBody = options.responseBody
  }
}
