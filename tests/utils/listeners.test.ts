import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  encodeEventTopics,
  encodeAbiParameters,
  parseAbiParameters,
  type Address,
  type Hex,
} from 'viem'
import {
  onTokenTransfer,
  onNftTransfer,
  getTransferTopics,
  decodeTokenTransferLog,
  TRANSFER_EVENT_ABI,
  ERC721_TRANSFER_EVENT_ABI,
  padAddressTopic,
} from '../../src/utils/listeners.js'

const TOKEN = '0x00000000000000000000000000000000000000cc' as Address
const ALICE = '0x00000000000000000000000000000000000000A1' as Address
const BOB = '0x00000000000000000000000000000000000000b2' as Address

function buildErc20TransferLog(opts: {
  from: Address
  to: Address
  value: bigint
  blockNumber: bigint
}) {
  const topics = encodeEventTopics({
    abi: TRANSFER_EVENT_ABI as any,
    eventName: 'Transfer',
    args: { from: opts.from, to: opts.to },
  }) as Hex[]
  const data = encodeAbiParameters(parseAbiParameters('uint256 value'), [opts.value])
  return {
    address: TOKEN,
    topics,
    data,
    blockNumber: `0x${opts.blockNumber.toString(16)}`,
    blockHash: '0xbb',
    transactionHash: '0xtx',
    logIndex: '0x0',
  }
}

function buildErc721TransferLog(opts: {
  from: Address
  to: Address
  tokenId: bigint
  blockNumber: bigint
}) {
  const topics = encodeEventTopics({
    abi: ERC721_TRANSFER_EVENT_ABI as any,
    eventName: 'Transfer',
    args: { from: opts.from, to: opts.to, tokenId: opts.tokenId },
  }) as Hex[]
  return {
    address: TOKEN,
    topics,
    data: '0x' as Hex,
    blockNumber: `0x${opts.blockNumber.toString(16)}`,
    blockHash: '0xbb',
    transactionHash: '0xnft',
    logIndex: '0x1',
  }
}

describe('padAddressTopic / getTransferTopics', () => {
  it('pads addresses to 32-byte topics', () => {
    const topic = padAddressTopic(ALICE)
    expect(topic).toMatch(/^0x0{24}[0-9a-f]{40}$/)
    expect(topic.endsWith(ALICE.slice(2).toLowerCase())).toBe(true)
  })

  it('builds Transfer topic0 (+ optional from/to)', () => {
    const [t0, t1, t2] = getTransferTopics({ from: ALICE, to: BOB })
    expect(t0).toMatch(/^0x/)
    expect(t1?.toLowerCase()).toBe(padAddressTopic(ALICE).toLowerCase())
    expect(t2?.toLowerCase()).toBe(padAddressTopic(BOB).toLowerCase())
  })
})

describe('decodeTokenTransferLog', () => {
  it('parses amount and formats with decimals', () => {
    const log = buildErc20TransferLog({
      from: ALICE,
      to: BOB,
      value: 1_500_000n, // 1.5 with 6 decimals
      blockNumber: 10n,
    })
    const parsed = decodeTokenTransferLog(log, { decimals: 6, accountAddress: BOB })
    expect(parsed).not.toBeNull()
    expect(parsed!.value).toBe(1_500_000n)
    expect(parsed!.formattedValue).toBe('1.5')
    expect(parsed!.direction).toBe('incoming')
    expect(parsed!.from.toLowerCase()).toBe(ALICE.toLowerCase())
  })
})

describe('onTokenTransfer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('subscribes to transfers for an account with formatted amount and unsubscribe', async () => {
    let block = 50n
    const transfer = buildErc20TransferLog({
      from: ALICE,
      to: BOB,
      value: 2_000_000n,
      blockNumber: 51n,
    })

    const client = {
      request: vi.fn(async ({ method, params }: { method: string; params?: any[] }) => {
        if (method === 'eth_blockNumber') return `0x${block.toString(16)}`
        if (method === 'eth_getLogs') {
          const filter = params[0]
          const from = BigInt(filter.fromBlock)
          const to = BigInt(filter.toBlock)
          if (from <= 51n && to >= 51n) return [transfer]
          return []
        }
        return null
      }),
    }

    const received: any[] = []
    const stop = onTokenTransfer({
      client,
      tokenAddress: TOKEN,
      accountAddress: BOB,
      decimals: 6,
      direction: 'incoming',
      pollingIntervalMs: 500,
      onTransfer: (t) => {
        received.push(t)
      },
    })

    // anchor
    await vi.advanceTimersByTimeAsync(0)
    for (let i = 0; i < 15; i++) await Promise.resolve()

    block = 51n
    await vi.advanceTimersByTimeAsync(500)
    for (let i = 0; i < 20; i++) await Promise.resolve()

    expect(received).toHaveLength(1)
    expect(received[0].formattedValue).toBe('2')
    expect(received[0].direction).toBe('incoming')
    expect(received[0].value).toBe(2_000_000n)

    stop()
    block = 52n
    await vi.advanceTimersByTimeAsync(500)
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(received).toHaveLength(1)
  })

  it('ignores transfers that do not involve the watched account', async () => {
    let block = 1n
    const unrelated = buildErc20TransferLog({
      from: ALICE,
      to: ALICE,
      value: 1n,
      blockNumber: 2n,
    })
    // Wait - ALICE to ALICE doesn't involve BOB. Good.
    // Actually from ALICE to ALICE - not BOB.

    const client = {
      request: vi.fn(async ({ method }: { method: string }) => {
        if (method === 'eth_blockNumber') return `0x${block.toString(16)}`
        if (method === 'eth_getLogs') return block >= 2n ? [unrelated] : []
        return null
      }),
    }

    const cb = vi.fn()
    const stop = onTokenTransfer({
      client,
      tokenAddress: TOKEN,
      accountAddress: BOB,
      pollingIntervalMs: 200,
      onTransfer: cb,
    })

    await vi.advanceTimersByTimeAsync(0)
    for (let i = 0; i < 10; i++) await Promise.resolve()
    block = 2n
    await vi.advanceTimersByTimeAsync(200)
    for (let i = 0; i < 15; i++) await Promise.resolve()

    expect(cb).not.toHaveBeenCalled()
    stop()
  })
})

describe('onNftTransfer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('delivers tokenId for ERC-721 transfers to the account', async () => {
    let block = 10n
    const nftLog = buildErc721TransferLog({
      from: ALICE,
      to: BOB,
      tokenId: 42n,
      blockNumber: 11n,
    })

    const client = {
      request: vi.fn(async ({ method }: { method: string }) => {
        if (method === 'eth_blockNumber') return `0x${block.toString(16)}`
        if (method === 'eth_getLogs') return block >= 11n ? [nftLog] : []
        return null
      }),
    }

    const received: any[] = []
    const stop = onNftTransfer({
      client,
      tokenAddress: TOKEN,
      accountAddress: BOB,
      pollingIntervalMs: 300,
      onTransfer: (t) => received.push(t),
    })

    await vi.advanceTimersByTimeAsync(0)
    for (let i = 0; i < 10; i++) await Promise.resolve()
    block = 11n
    await vi.advanceTimersByTimeAsync(300)
    for (let i = 0; i < 20; i++) await Promise.resolve()

    expect(received).toHaveLength(1)
    expect(received[0].tokenId).toBe(42n)
    expect(received[0].direction).toBe('incoming')
    stop()
  })
})
