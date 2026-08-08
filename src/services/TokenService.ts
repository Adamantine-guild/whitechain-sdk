import type { Address, Abi } from 'viem'
import { CacheManager, defaultCacheManager, type CacheKeyParams } from '../cache/CacheManager.js'
import { ValidationError } from '../errors/index.js'

/** Minimal ERC-20 view surface used for static metadata. */
export const ERC20_METADATA_ABI = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const satisfies Abi

export interface TokenMetadata {
  address: Address
  decimals: number
  symbol: string
  name: string
}

export type TokenReadClient = {
  readContract: (args: {
    address: Address
    abi: Abi
    functionName: string
    args?: unknown[]
  }) => Promise<unknown>
}

export interface TokenServiceOptions {
  client: TokenReadClient
  chainId?: number | string
  cacheManager?: CacheManager
  /** Default TTL for static metadata (default: 24h). */
  defaultTtlMs?: number
  /** Disable caching entirely. */
  enableCache?: boolean
  abi?: Abi
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

/**
 * TokenService fetches static ERC-20 metadata with an in-memory LRU cache.
 *
 * Secondary calls for the same token resolve from cache without firing RPC.
 */
export class TokenService {
  public readonly client: TokenReadClient
  public readonly chainId: number | string
  public readonly cacheManager: CacheManager
  public readonly defaultTtlMs: number
  public enableCache: boolean
  public readonly abi: Abi

  constructor(options: TokenServiceOptions) {
    if (!options?.client) {
      throw new ValidationError('TokenService requires a client with readContract')
    }
    this.client = options.client
    this.chainId = options.chainId ?? 1
    this.cacheManager = options.cacheManager ?? defaultCacheManager
    this.defaultTtlMs = options.defaultTtlMs ?? DEFAULT_TTL_MS
    this.enableCache = options.enableCache ?? true
    this.abi = (options.abi ?? ERC20_METADATA_ABI) as Abi
  }

  private _key(address: Address, functionName: string): CacheKeyParams {
    return {
      chainId: this.chainId,
      contractAddress: address,
      functionName,
      args: [],
    }
  }

  private async _readCached<T>(
    address: Address,
    functionName: string,
    ttlMs?: number,
  ): Promise<T> {
    const keyParams = this._key(address, functionName)

    if (this.enableCache) {
      const cached = await this.cacheManager.get<T>(keyParams)
      if (cached !== undefined) {
        return cached
      }
    }

    const result = (await this.client.readContract({
      address,
      abi: this.abi,
      functionName,
      args: [],
    })) as T

    if (this.enableCache) {
      await this.cacheManager.set(keyParams, result, ttlMs ?? this.defaultTtlMs)
    }

    return result
  }

  /** Token decimals (uint8). Cached by default. */
  public async getTokenDecimals(address: Address, ttlMs?: number): Promise<number> {
    const value = await this._readCached<number | bigint>(address, 'decimals', ttlMs)
    return typeof value === 'bigint' ? Number(value) : Number(value)
  }

  /** Token symbol. Cached by default. */
  public async getTokenSymbol(address: Address, ttlMs?: number): Promise<string> {
    return this._readCached<string>(address, 'symbol', ttlMs)
  }

  /** Token name. Cached by default. */
  public async getTokenName(address: Address, ttlMs?: number): Promise<string> {
    return this._readCached<string>(address, 'name', ttlMs)
  }

  /** Fetch all static metadata fields (each field cached independently). */
  public async getTokenMetadata(address: Address, ttlMs?: number): Promise<TokenMetadata> {
    const [decimals, symbol, name] = await Promise.all([
      this.getTokenDecimals(address, ttlMs),
      this.getTokenSymbol(address, ttlMs),
      this.getTokenName(address, ttlMs),
    ])
    return { address, decimals, symbol, name }
  }

  /** Drop all cached entries managed by this service's CacheManager. */
  public async clearCache(): Promise<void> {
    await this.cacheManager.clear()
  }

  /** Temporarily or permanently disable caching. */
  public setCacheEnabled(enabled: boolean): void {
    this.enableCache = enabled
    this.cacheManager.enabled = enabled
  }
}

export function createTokenService(options: TokenServiceOptions): TokenService {
  return new TokenService(options)
}

/** Convenience clear on the process-wide default cache manager. */
export async function clearSdkCache(): Promise<void> {
  await defaultCacheManager.clear()
}
