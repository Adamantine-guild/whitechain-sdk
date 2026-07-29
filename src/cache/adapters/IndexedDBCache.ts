import type { CacheAdapter, CacheEntry } from './CacheAdapter.js'

export class IndexedDBCache implements CacheAdapter {
  private dbName: string
  private storeName = 'whitechain_cache'
  private memoryFallback = new Map<string, CacheEntry<any>>()

  constructor(dbName = 'WhiteChainSDKCache') {
    this.dbName = dbName
  }

  private isAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined'
  }

  async get<T = unknown>(key: string): Promise<CacheEntry<T> | undefined> {
    if (!this.isAvailable()) {
      const entry = this.memoryFallback.get(key)
      if (!entry) return undefined
      if (entry.ttlMs && Date.now() - entry.createdAt > entry.ttlMs) {
        this.memoryFallback.delete(key)
        return undefined
      }
      return entry as CacheEntry<T>
    }

    return new Promise((resolve) => {
      const req = window.indexedDB.open(this.dbName, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(this.storeName)
      }
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(this.storeName, 'readonly')
        const store = tx.objectStore(this.storeName)
        const getReq = store.get(key)

        getReq.onsuccess = () => {
          const entry = getReq.result as CacheEntry<T> | undefined
          if (!entry) {
            resolve(undefined)
            return
          }
          if (entry.ttlMs && Date.now() - entry.createdAt > entry.ttlMs) {
            this.delete(key)
            resolve(undefined)
            return
          }
          resolve(entry)
        }
        getReq.onerror = () => resolve(undefined)
      }
      req.onerror = () => resolve(undefined)
    })
  }

  async set<T = unknown>(
    key: string,
    value: T,
    options?: { ttlMs?: number; blockNumber?: bigint }
  ): Promise<void> {
    const entry: CacheEntry<T> = {
      value,
      createdAt: Date.now(),
      ttlMs: options?.ttlMs,
      blockNumber: options?.blockNumber,
    }

    if (!this.isAvailable()) {
      this.memoryFallback.set(key, entry)
      return
    }

    return new Promise((resolve) => {
      const req = window.indexedDB.open(this.dbName, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(this.storeName)
      }
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(this.storeName, 'readwrite')
        const store = tx.objectStore(this.storeName)
        store.put(entry, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
      }
      req.onerror = () => resolve()
    })
  }

  async delete(key: string): Promise<void> {
    if (!this.isAvailable()) {
      this.memoryFallback.delete(key)
      return
    }

    return new Promise((resolve) => {
      const req = window.indexedDB.open(this.dbName, 1)
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(this.storeName, 'readwrite')
        const store = tx.objectStore(this.storeName)
        store.delete(key)
        tx.oncomplete = () => resolve()
      }
      req.onerror = () => resolve()
    })
  }

  async clear(): Promise<void> {
    this.memoryFallback.clear()
    if (!this.isAvailable()) return

    return new Promise((resolve) => {
      const req = window.indexedDB.open(this.dbName, 1)
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(this.storeName, 'readwrite')
        const store = tx.objectStore(this.storeName)
        store.clear()
        tx.oncomplete = () => resolve()
      }
      req.onerror = () => resolve()
    })
  }
}
