import { WhiteChainError } from './BaseError.js'

/**
 * Thrown when arguments passed to SDK methods are invalid,
 * missing, or fail schema validation.
 */
export class ValidationError extends WhiteChainError {
  constructor(message: string) {
    super(message)
  }
}
