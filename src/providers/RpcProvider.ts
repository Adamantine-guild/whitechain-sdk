import type { Transport } from 'viem'
import { custom } from 'viem'
import { ContractRevertError, WhiteChainError } from '../errors/index.js'
import type { RpcProviderConfig } from '../types/config.js'
import {
  computeBackoffDelay,
  isRetryableError,
  isRetryableHttpStatus,
  type RetryOptions,
} from '../utils/retry.js'

export type RpcProviderOptions = RpcProviderConfig & {
  /** Cap on backoff delay in ms (default: 5000). */
  maxDelayMs?: number
  /** Jitter strategy for backoff (default: `full`). */
  jitter?: RetryOptions['jitter']
}

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

function extractRevertReason(message: string): string | undefined {
  const match = message.match(/execution reverted(?::\s*)?(.*)$/i)
  const reason = match?.[1]?.trim()
  return reason || undefined
}

function isContractRevertError(error: JsonRpcResponse['error']): boolean {
  return error?.code === 3 || /revert/i.test(error?.message ?? '')
}

/**
 * RpcProvider handles transient network failures (429, 502, 503, 504, ECONNRESET) gracefully
 * using exponential backoff + full jitter (defaults: initial 500ms, max 5000ms, 3 retries).
 *
 * Retries apply ONLY to transient HTTP/network-level failures.
 * Contract execution reverts and signed transaction submissions (`eth_sendRawTransaction`)
 * fail immediately without retrying to prevent double-submitting to the mempool.
 */
export class RpcProvider {
  public readonly url: string
  public readonly maxRetries: number
  public readonly initialDelayMs: number
  public readonly maxDelayMs: number
  public readonly jitter: NonNullable<RetryOptions['jitter']>
  private _fetchFn: typeof fetch
  private _nextId = 1
  private _sleepFn: (ms: number) => Promise<void>
  private _randomFn: () => number

  constructor(options: string | RpcProviderOptions) {
    if (typeof options === 'string') {
      this.url = options
      this.maxRetries = 3
      this.initialDelayMs = 500
      this.maxDelayMs = 5000
      this.jitter = 'full'
      this._fetchFn = globalThis.fetch
      this._sleepFn = (ms) => new Promise((r) => setTimeout(r, ms))
      this._randomFn = Math.random
    } else if (options && typeof options.url === 'string') {
      this.url = options.url
      this.maxRetries = options.maxRetries ?? 3
      // Prefer explicit option; fall back to 500ms to match issue #113 defaults.
      this.initialDelayMs = options.initialDelayMs ?? 500
      this.maxDelayMs = options.maxDelayMs ?? 5000
      this.jitter = options.jitter ?? 'full'
      this._fetchFn = options.fetchFn ?? globalThis.fetch
      this._sleepFn = (ms) => new Promise((r) => setTimeout(r, ms))
      this._randomFn = Math.random
    } else {
      throw new WhiteChainError('RPC URL must be provided to RpcProvider')
    }
  }

  /** Test helper: inject deterministic sleep / random for backoff verification. */
  public setRetryHooks(hooks: {
    sleepFn?: (ms: number) => Promise<void>
    randomFn?: () => number
  }): void {
    if (hooks.sleepFn) this._sleepFn = hooks.sleepFn
    if (hooks.randomFn) this._randomFn = hooks.randomFn
  }

  private _delayFor(attempt: number): number {
    return computeBackoffDelay(attempt, {
      initialDelayMs: this.initialDelayMs,
      maxDelayMs: this.maxDelayMs,
      backoffMultiplier: 2,
      jitter: this.jitter,
      randomFn: this._randomFn,
    })
  }

  /**
   * Execute JSON-RPC request with exponential backoff + jitter for transient network errors.
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

        if (isRetryableHttpStatus(response.status)) {
          const err = new WhiteChainError(
            `HTTP ${response.status} ${response.statusText || ''}`.trim(),
          )
          ;(err as any).status = response.status
          ;(err as any).retryable = true
          throw err
        }

        if (!response.ok) {
          const err = new WhiteChainError(`HTTP Error ${response.status}: ${response.statusText}`)
          ;(err as any).status = response.status
          ;(err as any).retryable = false
          throw err
        }

        const json = (await response.json()) as JsonRpcResponse<T>
        if (json.error) {
          // Contract reverts and JSON-RPC execution errors fail immediately
          if (isContractRevertError(json.error)) {
            throw new ContractRevertError({
              message: `JSON-RPC Error [${json.error.code}]: ${json.error.message}`,
              reason: extractRevertReason(json.error.message),
              rawData: json.error.data,
              rpcCode: json.error.code,
            })
          }
          const err = new WhiteChainError(
            `JSON-RPC Error [${json.error.code}]: ${json.error.message}`,
          )
          ;(err as any).retryable = false
          throw err
        }

        return json.result as T
      } catch (err: any) {
        // Contract reverts and other non-retryable RPC errors fail immediately
        if (err instanceof ContractRevertError || !isRetryableError(err)) {
          throw err
        }

        if (attempt < maxAttempts) {
          const delay = this._delayFor(attempt)
          await this._sleepFn(delay)
          attempt++
          continue
        }

        if (typeof err?.status === 'number') {
          throw new WhiteChainError(
            `HTTP ${err.status} after ${attempt} retries`,
          )
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
