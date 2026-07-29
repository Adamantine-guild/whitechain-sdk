export interface CacheEntry<T = unknown> {
  value: T
  createdAt: number
  ttlMs?: number
  blockNumber?: bigint
}

export interface CacheAdapter {
  get<T = unknown>(key: string): Promise<CacheEntry<T> | undefined>
  set<T = unknown>(
    key: string,
    value: T,
    options?: { ttlMs?: number; blockNumber?: bigint }
  ): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}
