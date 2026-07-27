import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { IpcProvider, createWhiteChainClient } from '../../src/index.js'
import type { Address } from 'viem'

class MockSocket extends EventEmitter {
  public encoding = 'utf8'
  public destroyed = false

  setEncoding(enc: string) {
    this.encoding = enc
  }

  write(data: string, cb?: (err?: Error | null) => void) {
    if (cb) setImmediate(() => cb(null))

    setImmediate(() => {
      const lines = data.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const req = JSON.parse(trimmed)
          if (req.method === 'eth_blockNumber') {
            this.emit('data', JSON.stringify({ jsonrpc: '2.0', id: req.id, result: '0x123456' }) + '\n')
          } else if (req.method === 'eth_getBalance') {
            this.emit('data', JSON.stringify({ jsonrpc: '2.0', id: req.id, result: '0xde0b6b3a7640000' }) + '\n')
          } else if (req.method === 'eth_failingCall') {
            this.emit(
              'data',
              JSON.stringify({
                jsonrpc: '2.0',
                id: req.id,
                error: { code: -32000, message: 'Execution reverted' },
              }) + '\n'
            )
          }
        } catch {
          // Ignore parse errors
        }
      }
    })
    return true
  }

  destroy() {
    this.destroyed = true
    this.emit('close')
  }
}

describe('IpcProvider', () => {
  it('connects over Node.js IPC socket and frames newline JSON-RPC payloads', async () => {
    const mockSocket = new MockSocket()
    const connectFn = (opts: any, cb?: () => void) => {
      if (cb) setImmediate(cb)
      return mockSocket
    }

    const provider = new IpcProvider({
      path: '/tmp/test-node.ipc',
      connectFn,
    })

    await provider.connect()
    expect(provider.isConnected()).toBe(true)

    const blockNumber = await provider.request<string>('eth_blockNumber')
    expect(blockNumber).toBe('0x123456')

    const balance = await provider.request<string>('eth_getBalance', ['0x1111111111111111111111111111111111111111'])
    expect(balance).toBe('0xde0b6b3a7640000')

    provider.disconnect()
    expect(provider.isConnected()).toBe(false)
  })

  it('correlates errors back to callers independently by request ID', async () => {
    const mockSocket = new MockSocket()
    const connectFn = (opts: any, cb?: () => void) => {
      if (cb) setImmediate(cb)
      return mockSocket
    }

    const provider = new IpcProvider({
      path: '\\\\.\\pipe\\geth.ipc',
      connectFn,
    })

    const p1 = provider.request('eth_blockNumber')
    const p2 = provider.request('eth_failingCall')
    const p3 = provider.request('eth_getBalance', ['0x2222222222222222222222222222222222222222'])

    await expect(p1).resolves.toBe('0x123456')
    await expect(p2).rejects.toThrow('JSON-RPC Error [-32000]: Execution reverted')
    await expect(p3).resolves.toBe('0xde0b6b3a7640000')

    provider.disconnect()
  })

  it('integrates cleanly with createWhiteChainClient via toTransport()', async () => {
    const mockSocket = new MockSocket()
    const connectFn = (opts: any, cb?: () => void) => {
      if (cb) setImmediate(cb)
      return mockSocket
    }

    const provider = new IpcProvider({
      path: '/tmp/test-node.ipc',
      connectFn,
    })

    const client = createWhiteChainClient({
      chain: {} as any,
      transport: provider.toTransport(),
      addresses: { grant: '0x000000000000000000000000000000000000dEaD' as Address },
    })

    expect(client.publicClient).toBeDefined()
    provider.disconnect()
  })

  it('throws WhiteChainError if instantiated in browser context', () => {
    const originalWindow = (globalThis as any).window
    try {
      ;(globalThis as any).window = {}
      expect(() => new IpcProvider('/tmp/test-node.ipc')).toThrow('IpcProvider is only supported in Node.js environment')
    } finally {
      if (originalWindow === undefined) {
        delete (globalThis as any).window
      } else {
        ;(globalThis as any).window = originalWindow
      }
    }
  })
})
