import type { Abi, Address, Log, Hex } from 'viem'

/** Minimal transport used by the event engine (HTTP polling or WS push). */
export type EventLogClient = {
  /** JSON-RPC style request (eth_getLogs, eth_blockNumber, eth_subscribe, …). */
  request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  /** Optional direct getLogs helper (viem public client). */
  getLogs?: (args: {
    address?: Address | Address[]
    events?: unknown[]
    args?: Record<string, unknown>
    fromBlock?: bigint | number | string
    toBlock?: bigint | number | string
  }) => Promise<Log[]>
  /** Optional block number helper. */
  getBlockNumber?: () => Promise<bigint>
}

export type DecodedEventArgs = Record<string, unknown>

export interface TypedEventLog<TArgs extends DecodedEventArgs = DecodedEventArgs> {
  eventName: string
  args: TArgs
  log: {
    address: Address
    blockNumber: bigint | null
    blockHash: Hex | null
    transactionHash: Hex | null
    logIndex: number | null
    topics: readonly Hex[]
    data: Hex
  }
}

export type EventCallback<TArgs extends DecodedEventArgs = DecodedEventArgs> = (
  event: TypedEventLog<TArgs>,
) => void | Promise<void>

export type Unsubscribe = () => void

export interface EventManagerOptions {
  address: Address
  abi: Abi
  client: EventLogClient
  /**
   * Polling interval for HTTP backends (ms). Default: 4000.
   * Ignored when a WebSocket subscribe transport is provided.
   */
  pollingIntervalMs?: number
  /** Start scanning from this block (default: latest). */
  fromBlock?: bigint | number | 'latest'
  /**
   * Optional WebSocket-like subscriber for eth_subscribe('logs').
   * When provided, real-time push is preferred over polling.
   */
  subscribeLogs?: (filter: {
    address: Address
    topics: (Hex | Hex[] | null)[]
  }, handler: (log: RawRpcLog) => void) => Promise<Unsubscribe> | Unsubscribe
  /** Called on non-fatal transport errors. */
  onError?: (error: unknown) => void
}

export interface RawRpcLog {
  address?: string
  topics?: string[]
  data?: string
  blockNumber?: string | null
  blockHash?: string | null
  transactionHash?: string | null
  logIndex?: string | number | null
  removed?: boolean
}

export interface AbiEventItem {
  type: 'event'
  name: string
  inputs?: readonly {
    name?: string
    type: string
    indexed?: boolean
    internalType?: string
  }[]
  anonymous?: boolean
}
