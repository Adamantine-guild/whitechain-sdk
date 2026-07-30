import { custom, type Transport, type Address } from 'viem'
import { WhiteChainError, ValidationError } from '../errors/index.js'
import type { WhiteChainConfig } from '../types.js'
import { createWhiteChainClient, type WhiteChainClient } from '../client.js'

export interface EIP1193Provider {
  /**
   * Sends a JSON-RPC request to the injected wallet provider.
   *
   * @param args - RPC method name and optional positional or named parameters.
   * @returns The provider-specific response payload.
   */
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>
  /** Registers a wallet event listener, when the provider supports events. */
  on?(event: string, listener: (...args: any[]) => void): this | void
  /** Removes a wallet event listener using the legacy provider method name. */
  removeListener?(event: string, listener: (...args: any[]) => void): this | void
  /** Removes a wallet event listener using the modern provider method name. */
  off?(event: string, listener: (...args: any[]) => void): this | void
}

/**
 * Small EIP-1193 provider adapter used by the SDK's browser entry points.
 *
 * It wraps an injected wallet provider such as `window.ethereum`, caches
 * `eth_chainId`, normalizes disconnected-provider failures, and exposes a
 * viem-compatible transport through {@link toTransport}.
 *
 * @example
 * ```ts
 * const provider = new Eip1193Provider(window.ethereum)
 * const accounts = await provider.requestAccounts()
 * const chainId = await provider.getChainId()
 * ```
 */
export class Eip1193Provider {
  public readonly rawProvider: EIP1193Provider
  private _cachedChainId: number | null = null
  private _isConnected: boolean = true
  private _listeners: Map<string, Set<(...args: any[]) => void>> = new Map()

  /**
   * Creates an adapter around an explicit or injected EIP-1193 provider.
   *
   * @param provider - Wallet provider to wrap. Defaults to `window.ethereum` in browsers.
   * @throws {ValidationError} when no provider is available.
   */
  constructor(provider?: EIP1193Provider) {
    const injected = typeof window !== 'undefined' ? (window as any).ethereum : undefined
    const p = provider ?? injected

    if (!p) {
      throw new ValidationError('No EIP-1193 provider found. Please pass an explicit provider or connect a wallet like MetaMask.')
    }

    this.rawProvider = p
    this._setupEventListeners()
  }

  private _setupEventListeners(): void {
    if (typeof this.rawProvider.on === 'function') {
      this.rawProvider.on('chainChanged', (chainId: unknown) => {
        this._cachedChainId = null
        this._emit('chainChanged', chainId)
      })

      this.rawProvider.on('disconnect', (error: unknown) => {
        this._isConnected = false
        this._cachedChainId = null
        this._emit('disconnect', error)
      })

      this.rawProvider.on('accountsChanged', (accounts: unknown) => {
        this._emit('accountsChanged', accounts)
      })
    }
  }

  private _emit(event: string, ...args: any[]): void {
    const handlers = this._listeners.get(event)
    if (handlers) {
      for (const listener of handlers) {
        listener(...args)
      }
    }
  }

  /**
   * Reports whether the wrapped provider has emitted a disconnect event.
   *
   * @returns `true` until a provider-level disconnect is observed.
   */
  public isConnected(): boolean {
    return this._isConnected
  }

  /**
   * Sends an EIP-1193 request after checking provider connection state.
   *
   * @param args - RPC method name and optional parameters.
   * @returns The provider response typed by the caller.
   * @throws {ValidationError} when the provider is disconnected.
   */
  public async request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T> {
    if (!this._isConnected) {
      throw new ValidationError('Provider is disconnected')
    }

    try {
      const res = await this.rawProvider.request(args)
      return res as T
    } catch (err: any) {
      throw err
    }
  }

  /**
   * Reads and caches the active EVM chain ID.
   *
   * @returns Decimal chain ID parsed from `eth_chainId`.
   */
  public async getChainId(): Promise<number> {
    if (this._cachedChainId !== null) {
      return this._cachedChainId
    }
    const hex = await this.request<string | number>({ method: 'eth_chainId' })
    const chainId = typeof hex === 'number' ? hex : parseInt(hex, 16)
    this._cachedChainId = chainId
    return chainId
  }

  /**
   * Reads currently authorized wallet accounts without prompting the user.
   *
   * @returns Addresses returned by `eth_accounts`.
   */
  public async getAccounts(): Promise<Address[]> {
    return this.request<Address[]>({ method: 'eth_accounts' })
  }

  /**
   * Requests wallet account access from the user.
   *
   * @returns Addresses returned by `eth_requestAccounts`.
   */
  public async requestAccounts(): Promise<Address[]> {
    return this.request<Address[]>({ method: 'eth_requestAccounts' })
  }

  /**
   * Registers an SDK-level listener for provider events.
   *
   * @param event - Event name such as `chainChanged`, `accountsChanged`, or `disconnect`.
   * @param listener - Callback invoked with provider event arguments.
   * @returns This provider adapter for chaining.
   */
  public on(event: string, listener: (...args: any[]) => void): this {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set())
    }
    this._listeners.get(event)!.add(listener)
    return this
  }

  /**
   * Removes a previously registered SDK-level listener.
   *
   * @param event - Event name.
   * @param listener - Listener function originally passed to {@link on}.
   * @returns This provider adapter for chaining.
   */
  public removeListener(event: string, listener: (...args: any[]) => void): this {
    const handlers = this._listeners.get(event)
    if (handlers) {
      handlers.delete(listener)
    }
    return this
  }

  /** Alias for {@link removeListener}. */
  public off(event: string, listener: (...args: any[]) => void): this {
    return this.removeListener(event, listener)
  }

  /**
   * Converts the wrapped provider into a viem custom transport.
   *
   * @returns A transport suitable for `createPublicClient` and `createWalletClient`.
   */
  public toTransport(): Transport {
    return custom({
      request: async (args) => {
        return this.request(args as { method: string; params?: unknown[] | Record<string, unknown> })
      },
    })
  }
}

export class BrowserProvider extends Eip1193Provider {}

/**
 * Creates a browser-backed WhiteChain client from an EIP-1193 provider.
 *
 * @param config - WhiteChain client configuration plus an injected or wrapped provider.
 * @returns A {@link WhiteChainClient} using the provider's viem transport.
 *
 * @example
 * ```ts
 * const client = createBrowserClient({
 *   provider: window.ethereum,
 *   addresses: { grant },
 *   abis: { grant: grantAbi },
 * })
 * ```
 */
export function createBrowserClient(
  config: Omit<WhiteChainConfig, 'transport'> & { provider?: EIP1193Provider | Eip1193Provider }
): WhiteChainClient {
  const provider = config.provider instanceof Eip1193Provider
    ? config.provider
    : new Eip1193Provider(config.provider)

  return createWhiteChainClient({
    ...config,
    transport: provider.toTransport(),
  })
}
