import type { CacheAdapter, CacheEntry } from './CacheAdapter.js'

export class MemoryCache implements CacheAdapter {
  private store = new Map<string, CacheEntry<any>>()

  async get<T = unknown>(key: string): Promise<CacheEntry<T> | undefined> {
    const entry = this.store.get(key)
    if (!entry) return undefined

    if (entry.ttlMs && Date.now() - entry.createdAt > entry.ttlMs) {
      this.store.delete(key)
      return undefined
    }

    return entry as CacheEntry<T>
  }

  async set<T = unknown>(
    key: string,
    value: T,
    options?: { ttlMs?: number; blockNumber?: bigint }
  ): Promise<void> {
    this.store.set(key, {
      value,
      createdAt: Date.now(),
      ttlMs: options?.ttlMs,
      blockNumber: options?.blockNumber,
    })
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }

  async clear(): Promise<void> {
    this.store.clear()
  }
}
