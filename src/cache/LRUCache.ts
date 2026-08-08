/**
 * Zero-dependency in-memory LRU cache with optional per-entry TTL.
 *
 * Capacity is hard-bounded (default 500) so long-running processes cannot leak
 * unbounded memory from static metadata lookups.
 */

export interface LRUCacheOptions {
  /** Maximum number of live entries (default: 500). */
  maxSize?: number
  /** Default TTL applied when a set() call omits ttlMs (default: undefined = no expiry). */
  defaultTtlMs?: number
  /** Optional clock for tests. */
  now?: () => number
}

export interface LRUCacheStats {
  size: number
  maxSize: number
  hits: number
  misses: number
  evictions: number
}

interface LRUNode<V> {
  key: string
  value: V
  createdAt: number
  ttlMs?: number
  prev: LRUNode<V> | null
  next: LRUNode<V> | null
}

/**
 * Synchronous LRU map. Used as the primary adapter for static contract data.
 */
export class LRUCache<V = unknown> {
  public readonly maxSize: number
  public readonly defaultTtlMs?: number
  private readonly _now: () => number
  private readonly _map = new Map<string, LRUNode<V>>()
  private _head: LRUNode<V> | null = null // most recently used
  private _tail: LRUNode<V> | null = null // least recently used
  private _hits = 0
  private _misses = 0
  private _evictions = 0

  constructor(options: LRUCacheOptions = {}) {
    const maxSize = options.maxSize ?? 500
    if (!Number.isFinite(maxSize) || maxSize < 1) {
      throw new Error('LRUCache maxSize must be a positive integer')
    }
    this.maxSize = Math.floor(maxSize)
    this.defaultTtlMs = options.defaultTtlMs
    this._now = options.now ?? (() => Date.now())
  }

  public get size(): number {
    return this._map.size
  }

  public stats(): LRUCacheStats {
    return {
      size: this._map.size,
      maxSize: this.maxSize,
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
    }
  }

  public has(key: string): boolean {
    return this.get(key) !== undefined
  }

  public get(key: string): V | undefined {
    const node = this._map.get(key)
    if (!node) {
      this._misses++
      return undefined
    }
    if (this._isExpired(node)) {
      this._remove(node)
      this._map.delete(key)
      this._misses++
      return undefined
    }
    this._touch(node)
    this._hits++
    return node.value
  }

  public set(key: string, value: V, ttlMs?: number): void {
    const existing = this._map.get(key)
    const resolvedTtl = ttlMs ?? this.defaultTtlMs

    if (existing) {
      existing.value = value
      existing.createdAt = this._now()
      existing.ttlMs = resolvedTtl
      this._touch(existing)
      return
    }

    const node: LRUNode<V> = {
      key,
      value,
      createdAt: this._now(),
      ttlMs: resolvedTtl,
      prev: null,
      next: null,
    }
    this._map.set(key, node)
    this._insertHead(node)
    this._evictIfNeeded()
  }

  public delete(key: string): boolean {
    const node = this._map.get(key)
    if (!node) return false
    this._remove(node)
    this._map.delete(key)
    return true
  }

  public clear(): void {
    this._map.clear()
    this._head = null
    this._tail = null
  }

  /** Keys from most-recently-used to least-recently-used (skips expired). */
  public keys(): string[] {
    const out: string[] = []
    let cur = this._head
    while (cur) {
      if (!this._isExpired(cur)) out.push(cur.key)
      cur = cur.next
    }
    return out
  }

  /**
   * Drop all expired entries. Returns number removed.
   * Safe to call periodically in long-running processes.
   */
  public pruneExpired(): number {
    let removed = 0
    // Snapshot keys to avoid concurrent modification issues
    for (const [key, node] of Array.from(this._map.entries())) {
      if (this._isExpired(node)) {
        this._remove(node)
        this._map.delete(key)
        removed++
      }
    }
    return removed
  }

  private _isExpired(node: LRUNode<V>): boolean {
    if (node.ttlMs === undefined || node.ttlMs === null) return false
    return this._now() - node.createdAt > node.ttlMs
  }

  private _touch(node: LRUNode<V>): void {
    if (this._head === node) return
    this._remove(node)
    this._insertHead(node)
  }

  private _insertHead(node: LRUNode<V>): void {
    node.prev = null
    node.next = this._head
    if (this._head) this._head.prev = node
    this._head = node
    if (!this._tail) this._tail = node
  }

  private _remove(node: LRUNode<V>): void {
    if (node.prev) node.prev.next = node.next
    else this._head = node.next

    if (node.next) node.next.prev = node.prev
    else this._tail = node.prev

    node.prev = null
    node.next = null
  }

  private _evictIfNeeded(): void {
    while (this._map.size > this.maxSize && this._tail) {
      const lru = this._tail
      this._remove(lru)
      this._map.delete(lru.key)
      this._evictions++
    }
  }
}

export function createLRUCache<V = unknown>(options?: LRUCacheOptions): LRUCache<V> {
  return new LRUCache<V>(options)
}
