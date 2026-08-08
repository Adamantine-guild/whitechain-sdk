import { WhiteChainError } from './BaseError.js'
import { SdkErrorCode } from './codes.js'

/**
 * Thrown when an RPC request fails or returns an error response.
 * Contains HTTP status and response metadata.
 * Prefer `RPCNodeError` for new call sites (same domain, richer hierarchy).
 */
export class RpcError extends WhiteChainError {
  public readonly status?: number
  public readonly responseBody?: unknown

  constructor(message: string, status?: number, responseBody?: unknown) {
    super(message, {
      code: SdkErrorCode.RPC_NODE,
      context: { status },
    })
    this.name = 'RpcError'
    this.status = status
    this.responseBody = responseBody
  }
}
