import { http, type Transport } from 'viem'
import type { WhiteChainConfig, WhiteChainAddresses } from '../types.js'
import type { NetworkProfile } from '../config/networks.js'
import { ValidationError } from '../errors/index.js'

type RateLimitListener = () => void

export class Provider {
  public readonly network: NetworkProfile
  public readonly chainId: number
  public readonly rpcUrl: string
  public readonly blockExplorerUrl: string
  public readonly transport: Transport

  private _listeners: RateLimitListener[] = []

  constructor(network: NetworkProfile) {
    if (!network || typeof network.chainId !== 'number') {
      throw new ValidationError('Invalid network profile provided to Provider')
    }
    this.network = network
    this.chainId = network.chainId
    this.rpcUrl = network.rpcUrl
    this.blockExplorerUrl = network.blockExplorerUrl
    
    // Use a custom fetchFn to intercept 429 rate limits and emit an event
    this.transport = http(network.rpcUrl, {
      fetchOptions: {},
      fetchFn: async (url: string | URL | Request, init?: RequestInit) => {
        const response = await fetch(url, init)
        if (response.status === 429) {
          this.emit('rateLimit')
        }
        return response
      }
    })
  }

  public on(event: 'rateLimit', listener: RateLimitListener) {
    if (event === 'rateLimit') {
      this._listeners.push(listener)
    }
  }

  public emit(event: 'rateLimit') {
    if (event === 'rateLimit') {
      this._listeners.forEach((listener) => listener())
    }
  }

  getClientConfig(addresses: WhiteChainAddresses, overrides?: Partial<WhiteChainConfig>): WhiteChainConfig {
    return {
      network: this.network,
      chain: this.network.chain,
      transport: this.transport,
      addresses,
      blockExplorerUrl: this.blockExplorerUrl,
      ...overrides,
    }
  }
}

export function createProvider(network: NetworkProfile): Provider {
  return new Provider(network)
}
