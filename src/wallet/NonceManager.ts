import type { Address, PublicClient } from 'viem'
import { WhiteChainError } from '../types.js'

export type GetOnChainNonceFn = (address: Address) => Promise<number>

export type NonceManagerOptions = {
  address: Address
  publicClient?: PublicClient | { getTransactionCount(args: { address: Address; blockTag?: string }): Promise<number> }
  getOnChainNonce?: GetOnChainNonceFn
  initialNonce?: number
}

export class NonceManager {
  public readonly address: Address
  private _nextNonce: number | null = null
  private _getOnChainNonce?: GetOnChainNonceFn
  private _initialFetchPromise: Promise<number> | null = null
  private _nonceQueue: Array<(nonce: number) => void> = []

  constructor(options: NonceManagerOptions) {
    this.address = options.address

    if (options.initialNonce !== undefined) {
      if (options.initialNonce < 0 || !Number.isInteger(options.initialNonce)) {
        throw new WhiteChainError('initialNonce must be a non-negative integer')
      }
      this._nextNonce = options.initialNonce
    }

    if (options.getOnChainNonce) {
      this._getOnChainNonce = options.getOnChainNonce
    } else if (options.publicClient) {
      this._getOnChainNonce = async (addr: Address) => {
        const count = await (options.publicClient as any).getTransactionCount({ address: addr, blockTag: 'pending' })
        return typeof count === 'bigint' ? Number(count) : count
      }
    }
  }

  public isInitialized(): boolean {
    return this._nextNonce !== null
  }

  public getCachedNonce(): number | null {
    return this._nextNonce
  }

  public async getNextNonce(): Promise<number> {
    if (this._nextNonce !== null) {
      const nonce = this._nextNonce
      this._nextNonce++
      return nonce
    }

    if (this._initialFetchPromise) {
      return new Promise<number>((resolve) => {
        this._nonceQueue.push(resolve)
      })
    }

    if (!this._getOnChainNonce) {
      throw new WhiteChainError('No publicClient or getOnChainNonce provider configured for NonceManager')
    }

    this._initialFetchPromise = this._getOnChainNonce(this.address)

    try {
      const onChainNonce = await this._initialFetchPromise
      
      const queuedResolvers = this._nonceQueue
      this._nonceQueue = []
      
      let curr = onChainNonce + 1
      for (const resolve of queuedResolvers) {
        resolve(curr)
        curr++
      }
      this._nextNonce = curr
      this._initialFetchPromise = null

      return onChainNonce
    } catch (err) {
      this._initialFetchPromise = null
      this._nonceQueue = []
      throw err
    }
  }

  public async getNextNonceBigInt(): Promise<bigint> {
    const nonce = await this.getNextNonce()
    return BigInt(nonce)
  }

  public setNonce(nonce: number): void {
    if (nonce < 0 || !Number.isInteger(nonce)) {
      throw new WhiteChainError('nonce must be a non-negative integer')
    }
    this._nextNonce = nonce
  }

  public reset(): void {
    this._nextNonce = null
    this._initialFetchPromise = null
    this._nonceQueue = []
  }

  public async sendTransaction<T = unknown>(sendFn: (nonce: number) => Promise<T>): Promise<T> {
    const nonce = await this.getNextNonce()
    try {
      return await sendFn(nonce)
    } catch (error) {
      // If the transaction fails, caller can choose to reset() or handle
      throw error
    }
  }
}

export function createNonceManager(options: NonceManagerOptions): NonceManager {
  return new NonceManager(options)
}
export class NonceManager {
  private nonces = new Map<string, number>()
  private pendingFetches = new Map<string, Promise<number>>()

  /**
   * Retrieves the next valid nonce for a given address.
   * If a nonce is already cached, it is atomically incremented synchronously.
   * Otherwise, it fetches the nonce via the provided `fetchFn`.
   */
  async getNonce(address: string, fetchFn: () => Promise<number>): Promise<number> {
    const normalizedAddress = address.toLowerCase()

    // 1. If we already have a cached nonce, we can synchronously reserve it
    // and increment our local counter to prevent collisions.
    const cached = this.nonces.get(normalizedAddress)
    if (cached !== undefined) {
      this.nonces.set(normalizedAddress, cached + 1)
      return cached
    }

    // 2. If a fetch is currently in progress, we await it, but we MUST
    // NOT simply return its result. Another async call might have raced us 
    // and consumed it. Instead, we recursively call getNonce once the
    // fetch is done, so we pick up the latest cached value synchronously.
    const pending = this.pendingFetches.get(normalizedAddress)
    if (pending) {
      await pending
      return this.getNonce(address, fetchFn)
    }

    // 3. Initiate a new fetch.
    const promise = fetchFn()
      .then((fetchedNonce) => {
        // Set the initial nonce cache. Waking awaiters will synchronously increment it.
        this.nonces.set(normalizedAddress, fetchedNonce)
        this.pendingFetches.delete(normalizedAddress)
        return fetchedNonce
      })
      .catch((err) => {
        this.pendingFetches.delete(normalizedAddress)
        throw err
      })

    this.pendingFetches.set(normalizedAddress, promise)
    await promise

    // 4. Return via step 1 logic to synchronously reserve and increment it.
    return this.getNonce(address, fetchFn)
  }

  /**
   * Resets the nonce cache for an address, forcing the next call to fetch via RPC.
   * Useful when a transaction drops or errors due to an incorrect nonce.
   */
  reset(address: string): void {
    const normalizedAddress = address.toLowerCase()
    this.nonces.delete(normalizedAddress)
  }
}
