import type { Abi } from 'viem'

export interface AbiCacheOptions {
  /** Maximum number of entries before LRU eviction. Default: 50 */
  maxSize?: number
  /** Time-to-live in milliseconds before a cached entry is considered stale. Default: 5 minutes */
  ttlMs?: number
}

interface CacheEntry {
  abi: Abi
  fetchedAt: number
  /** LRU tracking — insertion order in the Map is used for eviction */
}

/**
 * LRU cache for dynamically-fetched contract ABIs with TTL-based invalidation.
 *
 * @example
 * ```ts
 * const cache = new AbiCache({ maxSize: 50, ttlMs: 5 * 60 * 1000 })
 *
 * // First call: fetches and caches
 * const abi = await cache.get('0xContractAddress', () => fetchAbi('0xContractAddress'))
 *
 * // Second call: returns instantly from cache
 * const abi2 = await cache.get('0xContractAddress', () => fetchAbi('0xContractAddress'))
 * ```
 */
export class AbiCache {
  public readonly maxSize: number
  public readonly ttlMs: number

  /** Ordered Map — iteration order = insertion order, enabling LRU eviction */
  private _cache: Map<string, CacheEntry> = new Map()

  constructor(options: AbiCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 50
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000
  }

  /**
   * Returns the number of entries currently in the cache.
   */
  get size(): number {
    return this._cache.size
  }

  /**
   * Returns true if a fresh (non-expired) entry exists for this key.
   */
  has(key: string): boolean {
    const entry = this._cache.get(key)
    if (!entry) return false
    return !this._isExpired(entry)
  }

  /**
   * Get an ABI by key. If the entry is missing or expired, `fetchFn` is called
   * to retrieve a fresh value which is then stored in the cache.
   *
   * @param key     A unique identifier for the ABI (e.g. contract address, URL).
   * @param fetchFn Async function that fetches the ABI when the cache misses.
   */
  async get(key: string, fetchFn: () => Promise<Abi> | Abi): Promise<Abi> {
    const existing = this._cache.get(key)

    if (existing && !this._isExpired(existing)) {
      // LRU: refresh position by deleting and re-inserting
      this._cache.delete(key)
      this._cache.set(key, existing)
      return existing.abi
    }

    // Cache miss or expired — fetch fresh
    const abi = await fetchFn()
    this._set(key, abi)
    return abi
  }

  /**
   * Manually invalidate a single cache entry, forcing the next `get()` to re-fetch.
   */
  invalidate(key: string): void {
    this._cache.delete(key)
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this._cache.clear()
  }

  private _isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.fetchedAt > this.ttlMs
  }

  private _set(key: string, abi: Abi): void {
    // If key already exists, delete first to update LRU position
    if (this._cache.has(key)) {
      this._cache.delete(key)
    }

    // Evict LRU entry if at capacity (first item in Map = oldest)
    if (this._cache.size >= this.maxSize) {
      const lruKey = this._cache.keys().next().value
      if (lruKey !== undefined) {
        this._cache.delete(lruKey)
      }
    }

    this._cache.set(key, { abi, fetchedAt: Date.now() })
  }
}

/**
 * A default shared `AbiCache` instance with standard defaults.
 * Suitable for most use cases without needing to instantiate your own.
 */
export const abiCache = new AbiCache()
