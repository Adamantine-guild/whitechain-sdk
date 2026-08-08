import { WhiteChainError } from './BaseError.js'
import { SdkErrorCode } from './codes.js'

/**
 * Thrown when arguments passed to SDK methods are invalid,
 * missing, or fail schema validation.
 */
export class ValidationError extends WhiteChainError {
  constructor(message: string) {
    super(message, { code: SdkErrorCode.VALIDATION })
    this.name = 'ValidationError'
  }
}
