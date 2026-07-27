import type { WhiteChainConfig } from '../types.js'

export interface RpcProviderConfig {
  /** Target RPC URL endpoint. */
  url: string
  /** Maximum number of retry attempts for transient network failures (default: 3). */
  maxRetries?: number
  /** Initial delay in milliseconds for exponential backoff calculations (default: 1000). */
  initialDelayMs?: number
  /** Custom fetch implementation for requests. */
  fetchFn?: typeof fetch
}

export type { WhiteChainConfig }
