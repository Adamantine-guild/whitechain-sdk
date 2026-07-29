import type { CacheAdapter } from './adapters/CacheAdapter.js'
import { MemoryCache } from './adapters/MemoryCache.js'

export interface CacheOptions {
  enabled?: boolean
  adapter?: CacheAdapter
  defaultTtlMs?: number
}

export interface CacheKeyParams {
  chainId: number | string
  contractAddress: string
  functionName: string
  args?: unknown[]
}

/**
 * CacheManager manages caching read calls across the SDK.
 * Cache keys uniquely identify chain ID, contract address, function name, and arguments.
 */
export class CacheManager {
  public enabled: boolean
  public adapter: CacheAdapter
  public defaultTtlMs?: number

  constructor(options: CacheOptions = {}) {
    this.enabled = options.enabled ?? true
    this.adapter = options.adapter ?? new MemoryCache()
    this.defaultTtlMs = options.defaultTtlMs
  }

  public generateKey(params: CacheKeyParams): string {
    const chain = String(params.chainId).toLowerCase()
    const address = String(params.contractAddress).toLowerCase()
    const func = String(params.functionName)
    const argsKey = params.args
      ? JSON.stringify(params.args, (_, val) => (typeof val === 'bigint' ? val.toString() : val))
      : ''

    return `whitechain:${chain}:${address}:${func}:${argsKey}`
  }

  public async get<T = unknown>(params: CacheKeyParams): Promise<T | undefined> {
    if (!this.enabled) return undefined
    const key = this.generateKey(params)
    const entry = await this.adapter.get<T>(key)
    return entry?.value
  }

  public async set<T = unknown>(
    params: CacheKeyParams,
    value: T,
    ttlMs?: number
  ): Promise<void> {
    if (!this.enabled) return
    const key = this.generateKey(params)
    await this.adapter.set(key, value, { ttlMs: ttlMs ?? this.defaultTtlMs })
  }

  public async delete(params: CacheKeyParams): Promise<void> {
    const key = this.generateKey(params)
    await this.adapter.delete(key)
  }

  public async clear(): Promise<void> {
    await this.adapter.clear()
  }
}

export const defaultCacheManager = new CacheManager()
