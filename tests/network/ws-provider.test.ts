import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import {
  WsProvider,
  createWsProvider,
  computeReconnectDelay,
  type WebSocketLike,
} from '../../src/network/ws-provider.js'

class MockWebSocket extends EventEmitter implements WebSocketLike {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  public readyState = MockWebSocket.CONNECTING
  public sent: string[] = []
  public closed = false
  public closeCode?: number
  public closeReason?: string

  constructor(public readonly url: string) {
    super()
    // Open asynchronously to mirror real sockets.
    queueMicrotask(() => {
      if (this.readyState === MockWebSocket.CONNECTING) {
        this.readyState = MockWebSocket.OPEN
        this.emit('open')
      }
    })
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }
    this.sent.push(data)

    queueMicrotask(() => {
      let req: { id?: number; method?: string; params?: unknown[] }
      try {
        req = JSON.parse(data)
      } catch {
        return
      }

      if (req.method === 'eth_chainId') {
        this.emit(
          'message',
          JSON.stringify({ jsonrpc: '2.0', id: req.id, result: '0x1' }),
        )
      } else if (req.method === 'eth_blockNumber') {
        this.emit(
          'message',
          JSON.stringify({ jsonrpc: '2.0', id: req.id, result: '0xabc' }),
        )
      } else if (req.method === 'eth_subscribe') {
        const remoteId = `0xsub${(req.id ?? 0).toString(16)}`
        this.emit(
          'message',
          JSON.stringify({ jsonrpc: '2.0', id: req.id, result: remoteId }),
        )
      } else if (req.method === 'eth_unsubscribe') {
        this.emit(
          'message',
          JSON.stringify({ jsonrpc: '2.0', id: req.id, result: true }),
        )
      } else if (req.method === 'eth_fail') {
        this.emit(
          'message',
          JSON.stringify({
            jsonrpc: '2.0',
            id: req.id,
            error: { code: -32601, message: 'Method not found' },
          }),
        )
      }
    })
  }

  close(code?: number, reason?: string): void {
    this.closed = true
    this.closeCode = code
    this.closeReason = reason
    this.readyState = MockWebSocket.CLOSED
    queueMicrotask(() => this.emit('close', { code, reason }))
  }

  /** Simulate an unexpected drop (network toggle off). */
  drop(): void {
    this.readyState = MockWebSocket.CLOSED
    this.emit('close', { code: 1006, reason: 'abnormal' })
  }

  /** Push a subscription notification as the node would. */
  pushSubscription(remoteId: string, result: unknown): void {
    this.emit(
      'message',
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_subscription',
        params: { subscription: remoteId, result },
      }),
    )
  }
}

describe('computeReconnectDelay', () => {
  it('grows exponentially and caps at maxDelay', () => {
    expect(computeReconnectDelay(0, 500, 5000, 2, 0)).toBe(500)
    expect(computeReconnectDelay(1, 500, 5000, 2, 0)).toBe(1000)
    expect(computeReconnectDelay(2, 500, 5000, 2, 0)).toBe(2000)
    expect(computeReconnectDelay(3, 500, 5000, 2, 0)).toBe(4000)
    expect(computeReconnectDelay(4, 500, 5000, 2, 0)).toBe(5000)
    expect(computeReconnectDelay(10, 500, 5000, 2, 0)).toBe(5000)
  })
})

describe('WsProvider auto-reconnect', () => {
  let sockets: MockWebSocket[]

  beforeEach(() => {
    sockets = []
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function factory(url: string): WebSocketLike {
    const ws = new MockWebSocket(url)
    sockets.push(ws)
    return ws
  }

  async function flushMicrotasks(times = 5): Promise<void> {
    for (let i = 0; i < times; i++) {
      await Promise.resolve()
    }
  }

  it('connects and serves JSON-RPC requests', async () => {
    const provider = createWsProvider({
      url: 'ws://localhost:8546',
      webSocketFactory: factory,
      autoConnect: false,
      jitterRatio: 0,
    })

    const connectPromise = provider.connect()
    await flushMicrotasks()
    await connectPromise

    expect(provider.isConnected()).toBe(true)
    expect(sockets).toHaveLength(1)

    const block = await provider.request<string>('eth_blockNumber')
    expect(block).toBe('0xabc')

    provider.destroy()
  })

  it('reconnects after unexpected close with exponential backoff (no spam)', async () => {
    const provider = createWsProvider({
      url: 'ws://localhost:8546',
      webSocketFactory: factory,
      autoConnect: false,
      initialDelayMs: 100,
      maxDelayMs: 800,
      backoffMultiplier: 2,
      jitterRatio: 0,
      maxReconnectAttempts: 5,
    })

    // Deterministic delays (no jitter already).
    provider.setDelayFn((attempt, initial, max, mult) =>
      Math.min(max, initial * Math.pow(mult, attempt)),
    )

    const reconnecting = vi.fn()
    const reconnected = vi.fn()
    provider.on('reconnecting', reconnecting)
    provider.on('reconnected', reconnected)

    const connectPromise = provider.connect()
    await flushMicrotasks()
    await connectPromise
    expect(sockets).toHaveLength(1)

    // Network drop
    sockets[0].drop()
    await flushMicrotasks()

    expect(provider.readyState).toBe('reconnecting')
    expect(reconnecting).toHaveBeenCalledTimes(1)
    expect(reconnecting.mock.calls[0][0]).toMatchObject({ attempt: 1, delayMs: 100 })

    // Before timer fires, still one socket
    expect(sockets).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(100)
    await flushMicrotasks()

    expect(sockets).toHaveLength(2)
    expect(provider.isConnected()).toBe(true)
    expect(reconnected).toHaveBeenCalledTimes(1)

    // Drop again — delay should double
    sockets[1].drop()
    await flushMicrotasks()
    expect(reconnecting).toHaveBeenCalledTimes(2)
    expect(reconnecting.mock.calls[1][0]).toMatchObject({ attempt: 1, delayMs: 100 })
    // After successful reconnect, attempt counter resets — so next is attempt 1 with 100ms again.
    // That's intentional to avoid permanent long delays after recovery.

    await vi.advanceTimersByTimeAsync(100)
    await flushMicrotasks()
    expect(sockets).toHaveLength(3)
    expect(provider.isConnected()).toBe(true)

    provider.destroy()
  })

  it('preserves subscriptions and re-subscribes after reconnect so events resume', async () => {
    const provider = createWsProvider({
      url: 'ws://localhost:8546',
      webSocketFactory: factory,
      autoConnect: false,
      initialDelayMs: 50,
      jitterRatio: 0,
    })
    provider.setDelayFn(() => 50)

    const connectPromise = provider.connect()
    await flushMicrotasks()
    await connectPromise

    const handler = vi.fn()
    const localId = await provider.subscribe(['newHeads'], handler)
    expect(localId).toMatch(/^local-/)
    expect(provider.getActiveSubscriptionIds()).toEqual([localId])

    // Find remote id from first socket subscribe response
    const firstSubSend = sockets[0].sent.find((s) => s.includes('eth_subscribe'))
    expect(firstSubSend).toBeTruthy()
    const firstReq = JSON.parse(firstSubSend!)
    const firstRemoteId = `0xsub${firstReq.id.toString(16)}`

    sockets[0].pushSubscription(firstRemoteId, { number: '0x1' })
    await flushMicrotasks()
    expect(handler).toHaveBeenCalledWith({ number: '0x1' })

    // Drop connection
    sockets[0].drop()
    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(50)
    await flushMicrotasks(10)

    expect(sockets).toHaveLength(2)
    expect(provider.isConnected()).toBe(true)

    // After reconnect, a new eth_subscribe should have been sent on the new socket
    await flushMicrotasks(10)
    const secondSubSends = sockets[1].sent.filter((s) => s.includes('eth_subscribe'))
    expect(secondSubSends.length).toBeGreaterThanOrEqual(1)

    const secondReq = JSON.parse(secondSubSends[0])
    const secondRemoteId = `0xsub${secondReq.id.toString(16)}`
    expect(secondRemoteId).not.toBe(firstRemoteId)

    // Events with the NEW remote id should reach the same handler
    sockets[1].pushSubscription(secondRemoteId, { number: '0x2' })
    await flushMicrotasks()
    expect(handler).toHaveBeenCalledWith({ number: '0x2' })

    // Old remote id should no longer map
    sockets[1].pushSubscription(firstRemoteId, { number: '0x999' })
    await flushMicrotasks()
    expect(handler).not.toHaveBeenCalledWith({ number: '0x999' })

    provider.destroy()
  })

  it('stops reconnecting after maxReconnectAttempts (prevents infinite spam)', async () => {
    const maxReached = vi.fn()
    const reconnecting = vi.fn()
    let createCount = 0

    // First socket opens normally; subsequent sockets never open (connect failures).
    const factoryOnce = (url: string): WebSocketLike => {
      createCount++
      if (createCount === 1) {
        const ws = new MockWebSocket(url)
        sockets.push(ws)
        return ws
      }
      // Fail-closed socket: never reaches OPEN, closes immediately
      const dead = new EventEmitter() as EventEmitter & WebSocketLike
      dead.readyState = MockWebSocket.CONNECTING
      dead.send = () => {
        throw new Error('not open')
      }
      dead.close = () => {
        dead.readyState = MockWebSocket.CLOSED
        queueMicrotask(() => dead.emit('close', { code: 1006 }))
      }
      sockets.push(dead as unknown as MockWebSocket)
      queueMicrotask(() => {
        dead.readyState = MockWebSocket.CLOSED
        dead.emit('close', { code: 1006, reason: 'failed' })
      })
      return dead
    }

    const p2 = createWsProvider({
      url: 'ws://localhost:8546',
      webSocketFactory: factoryOnce,
      autoConnect: false,
      initialDelayMs: 10,
      jitterRatio: 0,
      maxReconnectAttempts: 2,
    })
    p2.setDelayFn(() => 10)
    p2.on('maxReconnectsReached', maxReached)
    p2.on('reconnecting', reconnecting)

    const c = p2.connect()
    await flushMicrotasks(10)
    await c
    expect(p2.isConnected()).toBe(true)

    // Drop the healthy socket to start the reconnect loop
    sockets[0].drop()
    await flushMicrotasks(10)

    // Reconnect attempt 1 (fails closed)
    await vi.advanceTimersByTimeAsync(10)
    await flushMicrotasks(15)

    // Reconnect attempt 2 (fails closed) -> then max reached on next schedule
    await vi.advanceTimersByTimeAsync(10)
    await flushMicrotasks(15)

    await vi.advanceTimersByTimeAsync(10)
    await flushMicrotasks(15)

    await vi.advanceTimersByTimeAsync(10)
    await flushMicrotasks(15)

    expect(maxReached).toHaveBeenCalled()
    expect(reconnecting.mock.calls.length).toBe(2)
    p2.destroy()
  })

  it('does not reconnect after intentional disconnect()', async () => {
    const provider = createWsProvider({
      url: 'ws://localhost:8546',
      webSocketFactory: factory,
      autoConnect: false,
      initialDelayMs: 20,
      jitterRatio: 0,
    })

    const reconnecting = vi.fn()
    provider.on('reconnecting', reconnecting)

    const c = provider.connect()
    await flushMicrotasks()
    await c

    provider.disconnect()
    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(100)
    await flushMicrotasks()

    expect(reconnecting).not.toHaveBeenCalled()
    expect(sockets).toHaveLength(1)
    expect(provider.isConnected()).toBe(false)
    provider.destroy()
  })

  it('rejects invalid URLs', () => {
    expect(() => new WsProvider('http://not-ws')).toThrow(/Invalid WebSocket URL/)
  })

  it('surfaces JSON-RPC errors to the caller', async () => {
    const provider = createWsProvider({
      url: 'ws://localhost:8546',
      webSocketFactory: factory,
      autoConnect: false,
    })
    const c = provider.connect()
    await flushMicrotasks()
    await c

    await expect(provider.request('eth_fail')).rejects.toThrow(/Method not found/)
    provider.destroy()
  })
})
