import type { Transport } from 'viem'
import { custom } from 'viem'
import { WhiteChainError } from '../types.js'
import type { RpcProviderConfig } from '../types/config.js'

export type RpcProviderOptions = RpcProviderConfig

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params: unknown[]
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0'
  id: number
  result?: T
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

/**
 * RpcProvider handles transient network failures (429, 502, 503, 504, ECONNRESET) gracefully
 * using exponential backoff retries (1s, 2s, 4s, 8s).
 *
 * Retries apply ONLY to transient HTTP/network-level failures.
 * Contract execution reverts and signed transaction submissions (`eth_sendRawTransaction`)
 * fail immediately without retrying to prevent double-submitting to the mempool.
 */
export class RpcProvider {
  public readonly url: string
  public readonly maxRetries: number
  public readonly initialDelayMs: number
  private _fetchFn: typeof fetch
  private _nextId = 1

  constructor(options: string | RpcProviderOptions) {
    if (typeof options === 'string') {
      this.url = options
      this.maxRetries = 3
      this.initialDelayMs = 1000
      this._fetchFn = globalThis.fetch
    } else if (options && typeof options.url === 'string') {
      this.url = options.url
      this.maxRetries = options.maxRetries ?? 3
      this.initialDelayMs = options.initialDelayMs ?? 1000
      this._fetchFn = options.fetchFn ?? globalThis.fetch
    } else {
      throw new WhiteChainError('RPC URL must be provided to RpcProvider')
    }
  }

  /**
   * Execute JSON-RPC request with exponential backoff for transient network errors.
   */
  public async request<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const isSendRawTx = method === 'eth_sendRawTransaction'
    const maxAttempts = isSendRawTx ? 0 : this.maxRetries

    let attempt = 0
    while (true) {
      const id = this._nextId++
      const payload: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      }

      try {
        const fetchImpl = this._fetchFn ?? globalThis.fetch
        const response = await fetchImpl(this.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        const isTransientStatus = [429, 502, 503, 504].includes(response.status)
        if (isTransientStatus) {
          if (attempt < maxAttempts) {
            const delay = Math.pow(2, attempt) * this.initialDelayMs
            await new Promise((resolve) => setTimeout(resolve, delay))
            attempt++
            continue
          }
          throw new WhiteChainError(`HTTP ${response.status} ${response.statusText} after ${attempt} retries`)
        }

        if (!response.ok) {
          throw new WhiteChainError(`HTTP Error ${response.status}: ${response.statusText}`)
        }

        const json = (await response.json()) as JsonRpcResponse<T>
        if (json.error) {
          // Contract reverts and JSON-RPC execution errors fail immediately
          throw new WhiteChainError(`JSON-RPC Error [${json.error.code}]: ${json.error.message}`)
        }

        return json.result as T
      } catch (err: any) {
        // Contract reverts and explicit WhiteChainError for non-transient status fail immediately
        if (
          err instanceof WhiteChainError &&
          !err.message.startsWith('HTTP 429') &&
          !err.message.startsWith('HTTP 502') &&
          !err.message.startsWith('HTTP 503') &&
          !err.message.startsWith('HTTP 504')
        ) {
          throw err
        }

        // Retry network-level drops (e.g. ECONNRESET, ETIMEDOUT, network disconnect)
        if (attempt < maxAttempts) {
          const delay = Math.pow(2, attempt) * this.initialDelayMs
          await new Promise((resolve) => setTimeout(resolve, delay))
          attempt++
          continue
        }

        throw err
      }
    }
  }

  /**
   * Convert RpcProvider into a viem Transport.
   */
  public toTransport(): Transport {
    return custom({
      request: async ({ method, params }) => {
        const paramsArray = Array.isArray(params) ? params : params ? [params] : []
        return this.request(method, paramsArray)
      },
    })
  }
}

export function createRpcProvider(options: string | RpcProviderOptions): RpcProvider {
  return new RpcProvider(options)
}
