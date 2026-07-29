import type { Address, Abi } from 'viem'
import { Contract, type ContractClient } from './Contract.js'
import { CacheManager, defaultCacheManager } from '../cache/CacheManager.js'

export interface ContractWrapperOptions {
  address: Address
  abi: Abi
  client: ContractClient
  chainId?: number | string
  cacheManager?: CacheManager
  enableCache?: boolean
  defaultTtlMs?: number
}

export interface ReadCallOptions {
  useCache?: boolean
  ttlMs?: number
}

/**
 * ContractWrapper wraps a deployed smart contract with an optional, highly configurable caching layer
 * and in-flight request deduplication.
 *
 * Intercepts read requests (decimals, symbol, name, etc.) and returns cached results or joins pending
 * in-flight requests, saving RPC quota and eliminating redundant network calls.
 */
export class ContractWrapper extends Contract {
  public readonly chainId: number | string
  public cacheManager: CacheManager
  public enableCache: boolean
  public defaultTtlMs?: number
  private inFlight = new Map<string, Promise<any>>()

  constructor(options: ContractWrapperOptions) {
    super(options.address, options.abi, options.client)
    this.chainId = options.chainId ?? 1
    this.cacheManager = options.cacheManager ?? defaultCacheManager
    this.enableCache = options.enableCache ?? true
    this.defaultTtlMs = options.defaultTtlMs
  }

  /**
   * Executes a read function on the smart contract, attempting to serve from cache or pending in-flight requests.
   */
  public async read<T = unknown>(
    functionName: string,
    args: unknown[] = [],
    callOptions?: ReadCallOptions
  ): Promise<T> {
    const shouldCache = callOptions?.useCache ?? this.enableCache

    const keyParams = {
      chainId: this.chainId,
      contractAddress: this.address,
      functionName,
      args,
    }

    const key = this.cacheManager.generateKey(keyParams)

    if (shouldCache) {
      const cached = await this.cacheManager.get<T>(keyParams)
      if (cached !== undefined) {
        return cached
      }

      if (this.inFlight.has(key)) {
        return this.inFlight.get(key) as Promise<T>
      }
    }

    const fetchPromise = (async () => {
      try {
        let result: T
        const clientAny = this.client as any

        if (typeof clientAny.readContract === 'function') {
          result = await clientAny.readContract({
            address: this.address,
            abi: this.abi,
            functionName,
            args,
          })
        } else if (typeof clientAny.request === 'function') {
          result = (await clientAny.request({
            method: 'eth_call',
            params: [{ to: this.address, data: '0x' }, 'latest'],
          })) as T
        } else {
          throw new Error('Client does not support reading contract')
        }

        if (shouldCache) {
          await this.cacheManager.set(keyParams, result, callOptions?.ttlMs ?? this.defaultTtlMs)
        }

        return result
      } finally {
        this.inFlight.delete(key)
      }
    })()

    if (shouldCache) {
      this.inFlight.set(key, fetchPromise)
    }

    return fetchPromise
  }
}
