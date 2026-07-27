import { describe, it, expect } from 'vitest'
import {
  networks,
  sepolia,
  mainnet,
  whitechainMainnet,
  whitechainTestnet,
  Provider,
  createProvider,
  createWhiteChainClient,
} from '../src/index.js'
import type { Address } from 'viem'

const grantAddress = '0x000000000000000000000000000000000000dEaD' as Address

describe('Network Profiles & Provider', () => {
  it('exports standard network profiles with correct chainId, RPC, and block explorer URLs', () => {
    expect(sepolia.chainId).toBe(11155111)
    expect(sepolia.rpcUrl).toBe('https://rpc.sepolia.org')
    expect(sepolia.blockExplorerUrl).toBe('https://sepolia.etherscan.io')
    expect(sepolia.nativeCurrency).toEqual({
      name: 'Sepolia Ether',
      symbol: 'ETH',
      decimals: 18,
    })

    expect(mainnet.chainId).toBe(1)
    expect(mainnet.rpcUrl).toBe('https://eth.llamarpc.com')
    expect(mainnet.blockExplorerUrl).toBe('https://etherscan.io')

    expect(whitechainMainnet.chainId).toBe(1875)
    expect(whitechainMainnet.rpcUrl).toBe('https://rpc.whitechain.io')
    expect(whitechainMainnet.blockExplorerUrl).toBe('https://whitechain.io')

    expect(whitechainTestnet.chainId).toBe(2625)
    expect(whitechainTestnet.rpcUrl).toBe('https://rpc-testnet.whitechain.io')
    expect(whitechainTestnet.blockExplorerUrl).toBe('https://testnet.whitechain.io')

    expect(networks.sepolia).toBe(sepolia)
    expect(networks.mainnet).toBe(mainnet)
    expect(networks.whitechain).toBe(whitechainMainnet)
    expect(networks.whitechainMainnet).toBe(whitechainMainnet)
    expect(networks.whitechainTestnet).toBe(whitechainTestnet)
  })

  it('instantiates Provider with network profile and sets correct defaults', () => {
    const provider = new Provider(networks.sepolia)

    expect(provider.network).toBe(networks.sepolia)
    expect(provider.chainId).toBe(11155111)
    expect(provider.rpcUrl).toBe('https://rpc.sepolia.org')
    expect(provider.blockExplorerUrl).toBe('https://sepolia.etherscan.io')

    const config = provider.getClientConfig({ grant: grantAddress })
    expect(config.network).toBe(networks.sepolia)
    expect(config.blockExplorerUrl).toBe('https://sepolia.etherscan.io')
    expect(config.addresses.grant).toBe(grantAddress)
  })

  it('supports createProvider helper function', () => {
    const provider = createProvider(networks.mainnet)
    expect(provider).toBeInstanceOf(Provider)
    expect(provider.chainId).toBe(1)
    expect(provider.blockExplorerUrl).toBe('https://etherscan.io')
  })

  it('throws error when Provider is initialized with invalid network profile', () => {
    expect(() => new Provider(null as any)).toThrow('Invalid network profile provided to Provider')
    expect(() => new Provider({} as any)).toThrow('Invalid network profile provided to Provider')
  })

  it('configures createWhiteChainClient with network defaults', () => {
    const client = createWhiteChainClient({
      network: networks.sepolia,
      addresses: { grant: grantAddress },
    })

    expect(client.network).toBe(networks.sepolia)
    expect(client.blockExplorerUrl).toBe('https://sepolia.etherscan.io')
    expect(client.addresses.grant).toBe(grantAddress)
  })
})
