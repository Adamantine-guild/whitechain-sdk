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
