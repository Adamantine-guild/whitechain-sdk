/**
 * Base error class for all SDK-specific failures.
 * Preserves stack traces and provides a common root for instanceof checks.
 */
export class WhiteChainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
    
    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }
}
