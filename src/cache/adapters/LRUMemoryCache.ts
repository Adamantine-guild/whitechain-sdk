import type { CacheAdapter, CacheEntry } from './CacheAdapter.js'
import { LRUCache } from '../LRUCache.js'

export interface LRUMemoryCacheOptions {
  /** Maximum entries retained (default: 500). */
  maxSize?: number
  /** Default TTL for entries when set() omits ttlMs. */
  defaultTtlMs?: number
}

/**
 * CacheAdapter backed by a capacity-bounded LRU map with TTL expiry.
 * Drop-in replacement for the unbounded MemoryCache adapter.
 */
export class LRUMemoryCache implements CacheAdapter {
  private readonly _lru: LRUCache<CacheEntry<any>>

  constructor(options: LRUMemoryCacheOptions = {}) {
    this._lru = new LRUCache({
      maxSize: options.maxSize ?? 500,
      defaultTtlMs: options.defaultTtlMs,
    })
  }

  get lru(): LRUCache<CacheEntry<any>> {
    return this._lru
  }

  async get<T = unknown>(key: string): Promise<CacheEntry<T> | undefined> {
    const entry = this._lru.get(key)
    if (!entry) return undefined

    // Double-check entry-level TTL (LRU also tracks TTL on the entry wrapper)
    if (entry.ttlMs && Date.now() - entry.createdAt > entry.ttlMs) {
      this._lru.delete(key)
      return undefined
    }

    return entry as CacheEntry<T>
  }

  async set<T = unknown>(
    key: string,
    value: T,
    options?: { ttlMs?: number; blockNumber?: bigint },
  ): Promise<void> {
    const entry: CacheEntry<T> = {
      value,
      createdAt: Date.now(),
      ttlMs: options?.ttlMs,
      blockNumber: options?.blockNumber,
    }
    this._lru.set(key, entry, options?.ttlMs)
  }

  async delete(key: string): Promise<void> {
    this._lru.delete(key)
  }

  async clear(): Promise<void> {
    this._lru.clear()
  }
}
