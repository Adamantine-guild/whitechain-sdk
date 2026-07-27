import type { Chain, Transport } from 'viem'
import { mainnet as viemMainnet, sepolia as viemSepolia } from 'viem/chains'
import { http } from 'viem'
import type { WhiteChainConfig, WhiteChainAddresses } from '../types.js'

export interface NetworkCurrency {
  name: string
  symbol: string
  decimals: number
}

export interface NetworkProfile {
  name: string
  chainId: number
  rpcUrl: string
  blockExplorerUrl: string
  chain?: Chain
  nativeCurrency?: NetworkCurrency
}

export const whitechainMainnet: NetworkProfile = {
  name: 'WhiteChain Mainnet',
  chainId: 1875,
  rpcUrl: 'https://rpc.whitechain.io',
  blockExplorerUrl: 'https://whitechain.io',
  nativeCurrency: {
    name: 'WhiteChain Native',
    symbol: 'WBT',
    decimals: 18,
  },
}

export const whitechainTestnet: NetworkProfile = {
  name: 'WhiteChain Testnet',
  chainId: 2625,
  rpcUrl: 'https://rpc-testnet.whitechain.io',
  blockExplorerUrl: 'https://testnet.whitechain.io',
  nativeCurrency: {
    name: 'Testnet WBT',
    symbol: 'WBT',
    decimals: 18,
  },
}

export const sepolia: NetworkProfile = {
  name: 'Sepolia',
  chainId: 11155111,
  rpcUrl: 'https://rpc.sepolia.org',
  blockExplorerUrl: 'https://sepolia.etherscan.io',
  chain: viemSepolia,
  nativeCurrency: {
    name: 'Sepolia Ether',
    symbol: 'ETH',
    decimals: 18,
  },
}

export const mainnet: NetworkProfile = {
  name: 'Ethereum Mainnet',
  chainId: 1,
  rpcUrl: 'https://eth.llamarpc.com',
  blockExplorerUrl: 'https://etherscan.io',
  chain: viemMainnet,
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
}

export const networks = {
  whitechain: whitechainMainnet,
  whitechainMainnet,
  whitechainTestnet,
  sepolia,
  mainnet,
} as const

export { Provider, createProvider } from '../network/provider.js'
