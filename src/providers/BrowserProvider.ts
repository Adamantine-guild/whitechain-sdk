import { custom, type Transport, type Address } from 'viem'
import { WhiteChainError } from '../types.js'
import type { WhiteChainConfig } from '../types.js'
import { createWhiteChainClient, type WhiteChainClient } from '../client.js'

export interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>
  on?(event: string, listener: (...args: any[]) => void): this | void
  removeListener?(event: string, listener: (...args: any[]) => void): this | void
  off?(event: string, listener: (...args: any[]) => void): this | void
}

export class Eip1193Provider {
  public readonly rawProvider: EIP1193Provider
  private _cachedChainId: number | null = null
  private _isConnected: boolean = true
  private _listeners: Map<string, Set<(...args: any[]) => void>> = new Map()

  constructor(provider?: EIP1193Provider) {
    const injected = typeof window !== 'undefined' ? (window as any).ethereum : undefined
    const p = provider ?? injected

    if (!p) {
      throw new WhiteChainError('No EIP-1193 provider found. Please pass an explicit provider or connect a wallet like MetaMask.')
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

  public isConnected(): boolean {
    return this._isConnected
  }

  public async request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T> {
    if (!this._isConnected) {
      throw new WhiteChainError('Provider is disconnected')
    }

    try {
      const res = await this.rawProvider.request(args)
      return res as T
    } catch (err: any) {
      throw err
    }
  }

  public async getChainId(): Promise<number> {
    if (this._cachedChainId !== null) {
      return this._cachedChainId
    }
    const hex = await this.request<string | number>({ method: 'eth_chainId' })
    const chainId = typeof hex === 'number' ? hex : parseInt(hex, 16)
    this._cachedChainId = chainId
    return chainId
  }

  public async getAccounts(): Promise<Address[]> {
    return this.request<Address[]>({ method: 'eth_accounts' })
  }

  public async requestAccounts(): Promise<Address[]> {
    return this.request<Address[]>({ method: 'eth_requestAccounts' })
  }

  public on(event: string, listener: (...args: any[]) => void): this {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set())
    }
    this._listeners.get(event)!.add(listener)
    return this
  }

  public removeListener(event: string, listener: (...args: any[]) => void): this {
    const handlers = this._listeners.get(event)
    if (handlers) {
      handlers.delete(listener)
    }
    return this
  }

  public off(event: string, listener: (...args: any[]) => void): this {
    return this.removeListener(event, listener)
  }

  public toTransport(): Transport {
    return custom({
      request: async (args) => {
        return this.request(args as { method: string; params?: unknown[] | Record<string, unknown> })
      },
    })
  }
}

export class BrowserProvider extends Eip1193Provider {}

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
