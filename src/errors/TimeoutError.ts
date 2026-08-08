import { WhiteChainError } from './BaseError.js'
import { SdkErrorCode } from './codes.js'

/**
 * Thrown when an operation (like an RPC request) takes longer
 * than the configured maximum duration.
 */
export class TimeoutError extends WhiteChainError {
  constructor(message: string) {
    super(message, { code: SdkErrorCode.TIMEOUT })
    this.name = 'TimeoutError'
  }
}
