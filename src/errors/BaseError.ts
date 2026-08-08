import { SdkErrorCode, type SdkErrorCodeValue } from './codes.js'

/**
 * Diagnostic context attached to SDK errors for structured client handling.
 */
export interface SdkErrorContext {
  transactionHash?: string
  contractAddress?: string
  method?: string
  errorCode?: string | number
  revertReason?: string
  rpcCode?: number
  status?: number
  chainId?: number | string
  [key: string]: unknown
}

export interface WhitechainSDKErrorOptions {
  code?: SdkErrorCodeValue
  context?: SdkErrorContext
  cause?: unknown
}

/**
 * Base error class for all SDK-specific failures.
 * Preserves stack traces and provides a common root for instanceof checks.
 *
 * Also exported as `WhitechainSDKError` (issue #116 naming) for clients that
 * prefer the longer domain name.
 */
export class WhiteChainError extends Error {
  /** Machine-readable error code (stable across releases). */
  public readonly code: SdkErrorCodeValue
  /** Structured diagnostic metadata. */
  public readonly context: SdkErrorContext
  /** Original underlying error when this was wrapped. */
  public readonly cause?: unknown

  constructor(message: string, options: WhitechainSDKErrorOptions = {}) {
    super(message)
    this.name = this.constructor.name
    this.code = options.code ?? SdkErrorCode.UNKNOWN
    this.context = options.context ?? {}
    this.cause = options.cause

    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }

    // When wrapping another Error, append its stack for debugging
    if (options.cause instanceof Error && options.cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`
    }
  }

  /** Human-readable summary including code. */
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
    }
  }
}

/**
 * Canonical domain base class name from issue #116.
 * Identical behavior to `WhiteChainError` — prefer this for new client code.
 */
export class WhitechainSDKError extends WhiteChainError {
  constructor(message: string, options: WhitechainSDKErrorOptions = {}) {
    super(message, options)
    this.name = 'WhitechainSDKError'
  }
}
