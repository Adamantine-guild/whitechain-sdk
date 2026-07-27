import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  Eip1193Provider,
  BrowserProvider,
  createBrowserClient,
  type EIP1193Provider,
} from '../../src/providers/BrowserProvider.js'
import { WhiteChainError, createWhiteChainClient } from '../../src/index.js'
import type { Abi, Address } from 'viem'

function createMockEip1193Provider() {
  const listeners: Record<string, ((...args: any[]) => void)[]> = {}

  const request = vi.fn().mockImplementation(async ({ method, params }: { method: string; params?: any[] }) => {
    switch (method) {
      case 'eth_chainId':
        return '0x1'
      case 'eth_accounts':
        return ['0x1111111111111111111111111111111111111111']
      case 'eth_requestAccounts':
        return ['0x1111111111111111111111111111111111111111']
      case 'eth_sendTransaction':
        return '0xtxhash123'
      default:
        throw new Error(`Unhandled method: ${method}`)
    }
  })

  const on = vi.fn((event: string, listener: (...args: any[]) => void) => {
    if (!listeners[event]) listeners[event] = []
    listeners[event].push(listener)
  })

  const removeListener = vi.fn((event: string, listener: (...args: any[]) => void) => {
    if (listeners[event]) {
      listeners[event] = listeners[event].filter((l) => l !== listener)
    }
  })

  const emit = (event: string, ...args: any[]) => {
    if (listeners[event]) {
      for (const listener of listeners[event]) {
        listener(...args)
      }
    }
  }

  return {
    provider: { request, on, removeListener } as EIP1193Provider,
    request,
    on,
    removeListener,
    emit,
  }
}

describe('Eip1193Provider / BrowserProvider', () => {
  let mock: ReturnType<typeof createMockEip1193Provider>

  beforeEach(() => {
    mock = createMockEip1193Provider()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes with a provided EIP-1193 provider', () => {
    const provider = new Eip1193Provider(mock.provider)
    expect(provider.rawProvider).toBe(mock.provider)
    expect(provider.isConnected()).toBe(true)
    expect(mock.on).toHaveBeenCalledWith('chainChanged', expect.any(Function))
    expect(mock.on).toHaveBeenCalledWith('disconnect', expect.any(Function))
    expect(mock.on).toHaveBeenCalledWith('accountsChanged', expect.any(Function))
  })

  it('throws WhiteChainError if no provider is passed and window.ethereum is undefined', () => {
    expect(() => new Eip1193Provider()).toThrow(WhiteChainError)
  })

  it('uses window.ethereum when available if no explicit provider is passed', () => {
    const originalWindow = (globalThis as any).window
    ;(globalThis as any).window = { ethereum: mock.provider }

    try {
      const provider = new Eip1193Provider()
      expect(provider.rawProvider).toBe(mock.provider)
    } finally {
      ;(globalThis as any).window = originalWindow
    }
  })

  it('routes request({ method, params }) calls to rawProvider.request', async () => {
    const provider = new Eip1193Provider(mock.provider)
    const result = await provider.request({ method: 'eth_chainId' })
    expect(result).toBe('0x1')
    expect(mock.request).toHaveBeenCalledWith({ method: 'eth_chainId' })
  })

  it('fetches and caches chainId, returning parsed number', async () => {
    const provider = new Eip1193Provider(mock.provider)
    const chainId1 = await provider.getChainId()
    expect(chainId1).toBe(1)
    expect(mock.request).toHaveBeenCalledTimes(1)

    // Second call should return cached chainId without triggering another request
    const chainId2 = await provider.getChainId()
    expect(chainId2).toBe(1)
    expect(mock.request).toHaveBeenCalledTimes(1)
  })

  it('fetches accounts via getAccounts and requestAccounts', async () => {
    const provider = new Eip1193Provider(mock.provider)
    const accounts = await provider.getAccounts()
    expect(accounts).toEqual(['0x1111111111111111111111111111111111111111'])

    const reqAccounts = await provider.requestAccounts()
    expect(reqAccounts).toEqual(['0x1111111111111111111111111111111111111111'])
  })

  it('handles chainChanged event by invalidating cached chainId and notifying listeners', async () => {
    const provider = new Eip1193Provider(mock.provider)
    const chainListener = vi.fn()
    provider.on('chainChanged', chainListener)

    // Cache initial chainId (1)
    await provider.getChainId()
    expect(mock.request).toHaveBeenCalledTimes(1)

    // Update mock return value for chainId
    mock.request.mockImplementation(async ({ method }) => {
      if (method === 'eth_chainId') return '0x89' // Polygon Mainnet (137)
      return undefined
    })

    // Simulate MetaMask emitting chainChanged
    mock.emit('chainChanged', '0x89')
    expect(chainListener).toHaveBeenCalledWith('0x89')

    // Calling getChainId should fetch new chainId (137) instead of stale cached (1)
    const newChainId = await provider.getChainId()
    expect(newChainId).toBe(137)
    expect(mock.request).toHaveBeenCalledTimes(2)
  })

  it('handles disconnect event by invalidating state and blocking future requests', async () => {
    const provider = new Eip1193Provider(mock.provider)
    const disconnectListener = vi.fn()
    provider.on('disconnect', disconnectListener)

    expect(provider.isConnected()).toBe(true)

    // Simulate MetaMask emitting disconnect
    mock.emit('disconnect', { code: 4900, message: 'User disconnected' })

    expect(provider.isConnected()).toBe(false)
    expect(disconnectListener).toHaveBeenCalledWith({ code: 4900, message: 'User disconnected' })

    // Subsequent request calls should throw WhiteChainError
    await expect(provider.request({ method: 'eth_chainId' })).rejects.toThrow('Provider is disconnected')
  })

  it('allows removing event listeners', () => {
    const provider = new Eip1193Provider(mock.provider)
    const listener = vi.fn()
    provider.on('accountsChanged', listener)

    mock.emit('accountsChanged', ['0x2222222222222222222222222222222222222222'])
    expect(listener).toHaveBeenCalledTimes(1)

    provider.removeListener('accountsChanged', listener)
    mock.emit('accountsChanged', ['0x3333333333333333333333333333333333333333'])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('integrates seamlessly with BrowserProvider alias and createBrowserClient', async () => {
    const provider = new BrowserProvider(mock.provider)
    expect(provider).toBeInstanceOf(Eip1193Provider)

    const client = createBrowserClient({
      chain: {} as any,
      addresses: { grant: '0x000000000000000000000000000000000000dEaD' },
      provider,
    })

    expect(client.publicClient).toBeDefined()
  })

  it('integrates with createWhiteChainClient using provider option', async () => {
    const dummyAbi = [
      {
        type: 'function',
        name: 'submitApplication',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'grantId', type: 'uint256' },
          { name: 'applicant', type: 'address' },
          { name: 'metadataUri', type: 'string' },
        ],
        outputs: [],
      },
    ] as unknown as Abi

    const client = createWhiteChainClient({
      chain: {} as any,
      addresses: { grant: '0x000000000000000000000000000000000000dEaD' },
      abis: { grant: dummyAbi },
      provider: mock.provider,
      account: '0x1111111111111111111111111111111111111111' as Address,
    })

    expect(client.publicClient).toBeDefined()
    expect(client.walletClient).toBeDefined()
  })
})
