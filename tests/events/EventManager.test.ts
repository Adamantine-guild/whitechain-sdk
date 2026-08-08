import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  encodeEventTopics,
  encodeAbiParameters,
  parseAbiParameters,
  type Address,
  type Hex,
} from 'viem'
import { EventManager, createEventManager } from '../../src/events/EventManager.js'
import { ValidationError } from '../../src/errors/index.js'

const VAULT_ABI = [
  {
    type: 'event',
    name: 'Deposit',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Withdraw',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const

const CONTRACT = '0x00000000000000000000000000000000000000AA' as Address
const USER = '0x00000000000000000000000000000000000000bb' as Address

function buildDepositLog(opts: {
  user: Address
  amount: bigint
  blockNumber: bigint
  logIndex?: number
}) {
  const topics = encodeEventTopics({
    abi: VAULT_ABI as any,
    eventName: 'Deposit',
    args: { user: opts.user },
  }) as Hex[]
  const data = encodeAbiParameters(parseAbiParameters('uint256 amount'), [opts.amount])
  return {
    address: CONTRACT,
    topics,
    data,
    blockNumber: `0x${opts.blockNumber.toString(16)}`,
    blockHash: '0xabc',
    transactionHash: '0xdef',
    logIndex: `0x${(opts.logIndex ?? 0).toString(16)}`,
  }
}

describe('EventManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists event names from the ABI', () => {
    const mgr = createEventManager({
      address: CONTRACT,
      abi: VAULT_ABI as any,
      client: { request: async () => '0x1' },
    })
    expect(mgr.listEventNames().sort()).toEqual(['Deposit', 'Withdraw'])
  })

  it('throws when subscribing to an unknown event', () => {
    const mgr = new EventManager({
      address: CONTRACT,
      abi: VAULT_ABI as any,
      client: { request: async () => '0x1' },
    })
    expect(() => mgr.on('Nope', () => {})).toThrow(ValidationError)
  })

  it('delivers fully typed decoded args via polling without manual ABI decode', async () => {
    let block = 100n
    const logsByRange: Record<string, any[]> = {}

    const depositLog = buildDepositLog({ user: USER, amount: 1_500n, blockNumber: 101n })

    const client = {
      request: vi.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
        if (method === 'eth_blockNumber') {
          return `0x${block.toString(16)}`
        }
        if (method === 'eth_getLogs') {
          const filter = params?.[0] as { fromBlock: string; toBlock: string }
          const from = BigInt(filter.fromBlock)
          const to = BigInt(filter.toBlock)
          // Only return deposit when range covers block 101
          if (from <= 101n && to >= 101n) return [depositLog]
          return []
        }
        throw new Error(`unexpected ${method}`)
      }),
    }

    const mgr = new EventManager({
      address: CONTRACT,
      abi: VAULT_ABI as any,
      client,
      pollingIntervalMs: 1000,
      fromBlock: 'latest',
    })

    const received: any[] = []
    const unsub = mgr.on('Deposit', (event) => {
      received.push(event)
    })

    // First poll anchors at current head (100) without historical scan
    await vi.advanceTimersByTimeAsync(0)
    // flush microtasks from first poll
    for (let i = 0; i < 10; i++) await Promise.resolve()

    // New block with the deposit
    block = 101n
    await vi.advanceTimersByTimeAsync(1000)
    for (let i = 0; i < 20; i++) await Promise.resolve()

    expect(received).toHaveLength(1)
    expect(received[0].eventName).toBe('Deposit')
    expect(received[0].args.user.toLowerCase()).toBe(USER.toLowerCase())
    expect(received[0].args.amount).toBe(1_500n)
    expect(received[0].log.transactionHash).toBe('0xdef')

    // Unsubscribe prevents further deliveries
    unsub()
    block = 102n
    const second = buildDepositLog({ user: USER, amount: 99n, blockNumber: 102n })
    // monkey-patch: still would return if listening
    client.request.mockImplementation(async ({ method }: any) => {
      if (method === 'eth_blockNumber') return `0x${block.toString(16)}`
      if (method === 'eth_getLogs') return [second]
      return null
    })
    await vi.advanceTimersByTimeAsync(1000)
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(received).toHaveLength(1)

    mgr.destroy()
  })

  it('decodeLog returns typed payload offline', () => {
    const mgr = new EventManager({
      address: CONTRACT,
      abi: VAULT_ABI as any,
      client: { request: async () => '0x1' },
    })
    const raw = buildDepositLog({ user: USER, amount: 42n, blockNumber: 5n })
    const decoded = mgr.decodeLog(raw)
    expect(decoded?.eventName).toBe('Deposit')
    expect(decoded?.args.amount).toBe(42n)
  })

  it('supports WebSocket-style subscribeLogs and unsubscribes cleanly', async () => {
    let handler: ((log: any) => void) | null = null
    const unsubWs = vi.fn()

    const mgr = new EventManager({
      address: CONTRACT,
      abi: VAULT_ABI as any,
      client: { request: async () => '0x1' },
      subscribeLogs: async (_filter, h) => {
        handler = h
        return unsubWs
      },
    })

    const cb = vi.fn()
    const stop = mgr.on('Deposit', cb)
    // allow subscribe promise to resolve
    for (let i = 0; i < 10; i++) await Promise.resolve()

    expect(handler).toBeTruthy()
    handler!(buildDepositLog({ user: USER, amount: 7n, blockNumber: 1n }))
    for (let i = 0; i < 10; i++) await Promise.resolve()

    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb.mock.calls[0][0].args.amount).toBe(7n)

    stop()
    expect(unsubWs).toHaveBeenCalled()
    mgr.destroy()
  })
})
