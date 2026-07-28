import { WhiteChainError } from './BaseError.js'

/**
 * Thrown when an RPC request fails or returns an error response.
 * Contains HTTP status and response metadata.
 */
export class RpcError extends WhiteChainError {
  public readonly status?: number
  public readonly responseBody?: unknown

  constructor(message: string, status?: number, responseBody?: unknown) {
    super(message)
    this.status = status
    this.responseBody = responseBody
  }
}
