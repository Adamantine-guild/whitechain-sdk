import {
  decodeEventLog,
  encodeEventTopics,
  formatUnits,
  type Address,
  type Hex,
  type Log,
} from 'viem'
import { ValidationError } from '../errors/index.js'
import type { EventLogClient, RawRpcLog, Unsubscribe } from '../events/types.js'
import { EventManager } from '../events/EventManager.js'
import { padAddressTopic } from './addressTopics.js'

/** Minimal ERC-20 / ERC-721 Transfer event ABI. */
export const TRANSFER_EVENT_ABI = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const

/** ERC-721 Transfer uses indexed tokenId instead of value. */
export const ERC721_TRANSFER_EVENT_ABI = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
    ],
  },
] as const

export type TransferDirection = 'incoming' | 'outgoing' | 'both'

export interface ParsedTokenTransfer {
  tokenAddress: Address
  from: Address
  to: Address
  /** Raw on-chain amount (uint256). */
  value: bigint
  /** Formatted decimal string when `decimals` is known; otherwise null. */
  formattedValue: string | null
  decimals: number | null
  direction: 'incoming' | 'outgoing' | 'self'
  log: {
    blockNumber: bigint | null
    transactionHash: Hex | null
    logIndex: number | null
  }
}

export interface ParsedNftTransfer {
  tokenAddress: Address
  from: Address
  to: Address
  tokenId: bigint
  direction: 'incoming' | 'outgoing' | 'self'
  log: {
    blockNumber: bigint | null
    transactionHash: Hex | null
    logIndex: number | null
  }
}

export interface TokenTransferListenerOptions {
  client: EventLogClient
  /** Token contract address. */
  tokenAddress: Address
  /** Account to watch (from and/or to). */
  accountAddress: Address
  /** Callback invoked for each matching transfer. */
  onTransfer: (transfer: ParsedTokenTransfer) => void | Promise<void>
  /** Watch incoming, outgoing, or both (default: both). */
  direction?: TransferDirection
  /** Token decimals for formattedValue (default: null → no formatting). */
  decimals?: number
  pollingIntervalMs?: number
  fromBlock?: bigint | number | 'latest'
  onError?: (error: unknown) => void
  /**
   * Optional WS log subscriber. When provided, real-time push is used.
   * Signature matches EventManagerOptions.subscribeLogs.
   */
  subscribeLogs?: (filter: {
    address: Address
    topics: (Hex | Hex[] | null)[]
  }, handler: (log: RawRpcLog) => void) => Promise<Unsubscribe> | Unsubscribe
}

export interface NftTransferListenerOptions {
  client: EventLogClient
  tokenAddress: Address
  accountAddress: Address
  onTransfer: (transfer: ParsedNftTransfer) => void | Promise<void>
  direction?: TransferDirection
  pollingIntervalMs?: number
  fromBlock?: bigint | number | 'latest'
  onError?: (error: unknown) => void
  subscribeLogs?: TokenTransferListenerOptions['subscribeLogs']
}

function directionOf(
  from: Address,
  to: Address,
  account: Address,
): 'incoming' | 'outgoing' | 'self' {
  const a = account.toLowerCase()
  const f = from.toLowerCase()
  const t = to.toLowerCase()
  if (f === a && t === a) return 'self'
  if (t === a) return 'incoming'
  return 'outgoing'
}

function matchesDirection(
  dir: 'incoming' | 'outgoing' | 'self',
  wanted: TransferDirection,
): boolean {
  if (wanted === 'both') return true
  if (wanted === 'incoming') return dir === 'incoming' || dir === 'self'
  return dir === 'outgoing' || dir === 'self'
}

/**
 * Subscribe to ERC-20 `Transfer` events involving `accountAddress`.
 *
 * Abstracts HTTP polling vs WebSocket push. Returns `unsubscribe()` for React cleanup.
 *
 * @example
 * ```ts
 * const stop = onTokenTransfer({
 *   client,
 *   tokenAddress: USDC,
 *   accountAddress: user,
 *   decimals: 6,
 *   onTransfer: (t) => console.log(t.formattedValue, t.direction),
 * })
 * // on unmount:
 * stop()
 * ```
 */
export function onTokenTransfer(options: TokenTransferListenerOptions): Unsubscribe {
  if (!options?.client) throw new ValidationError('onTokenTransfer requires a client')
  if (!options.tokenAddress) throw new ValidationError('tokenAddress is required')
  if (!options.accountAddress) throw new ValidationError('accountAddress is required')

  const direction = options.direction ?? 'both'
  const decimals = options.decimals ?? null
  const account = options.accountAddress

  // Build topic filter: topic0 = Transfer, topic1/2 = from/to account depending on direction
  // For "both" we cannot OR topics in a single filter without multiple subscriptions;
  // EventManager polls all Transfer logs for the token and we filter client-side.
  const manager = new EventManager({
    address: options.tokenAddress,
    abi: TRANSFER_EVENT_ABI as unknown as any,
    client: options.client,
    pollingIntervalMs: options.pollingIntervalMs,
    fromBlock: options.fromBlock,
    onError: options.onError,
    subscribeLogs: options.subscribeLogs,
  })

  return manager.on('Transfer', async (event) => {
    const from = String(event.args.from ?? '') as Address
    const to = String(event.args.to ?? '') as Address
    const value = BigInt(event.args.value as bigint | string | number)

    const dir = directionOf(from, to, account)
    // Only events involving the watched account
    const involves =
      from.toLowerCase() === account.toLowerCase() ||
      to.toLowerCase() === account.toLowerCase()
    if (!involves) return
    if (!matchesDirection(dir, direction)) return

    const parsed: ParsedTokenTransfer = {
      tokenAddress: options.tokenAddress,
      from,
      to,
      value,
      decimals,
      formattedValue: decimals === null ? null : formatUnits(value, decimals),
      direction: dir,
      log: {
        blockNumber: event.log.blockNumber,
        transactionHash: event.log.transactionHash,
        logIndex: event.log.logIndex,
      },
    }

    await options.onTransfer(parsed)
  })
}

/**
 * Subscribe to ERC-721 `Transfer` events involving `accountAddress`.
 */
export function onNftTransfer(options: NftTransferListenerOptions): Unsubscribe {
  if (!options?.client) throw new ValidationError('onNftTransfer requires a client')
  if (!options.tokenAddress) throw new ValidationError('tokenAddress is required')
  if (!options.accountAddress) throw new ValidationError('accountAddress is required')

  const direction = options.direction ?? 'both'
  const account = options.accountAddress

  const manager = new EventManager({
    address: options.tokenAddress,
    abi: ERC721_TRANSFER_EVENT_ABI as unknown as any,
    client: options.client,
    pollingIntervalMs: options.pollingIntervalMs,
    fromBlock: options.fromBlock,
    onError: options.onError,
    subscribeLogs: options.subscribeLogs,
  })

  return manager.on('Transfer', async (event) => {
    const from = String(event.args.from ?? '') as Address
    const to = String(event.args.to ?? '') as Address
    const tokenId = BigInt(event.args.tokenId as bigint | string | number)

    const dir = directionOf(from, to, account)
    const involves =
      from.toLowerCase() === account.toLowerCase() ||
      to.toLowerCase() === account.toLowerCase()
    if (!involves) return
    if (!matchesDirection(dir, direction)) return

    const parsed: ParsedNftTransfer = {
      tokenAddress: options.tokenAddress,
      from,
      to,
      tokenId,
      direction: dir,
      log: {
        blockNumber: event.log.blockNumber,
        transactionHash: event.log.transactionHash,
        logIndex: event.log.logIndex,
      },
    }

    await options.onTransfer(parsed)
  })
}

/**
 * Low-level helper: compute Transfer topic0 + optional padded address topic.
 * Useful when building custom eth_getLogs filters.
 */
export function getTransferTopics(options?: {
  from?: Address | null
  to?: Address | null
  /** Use ERC-721 ABI (indexed tokenId). Default false (ERC-20). */
  erc721?: boolean
}): (Hex | null)[] {
  const abi = options?.erc721 ? ERC721_TRANSFER_EVENT_ABI : TRANSFER_EVENT_ABI
  const topics = encodeEventTopics({
    abi: abi as any,
    eventName: 'Transfer',
    args: {
      from: options?.from ?? undefined,
      to: options?.to ?? undefined,
    },
  }) as Hex[]
  // encodeEventTopics returns only defined topics; normalize to length-3 sparse array
  return [topics[0] ?? null, topics[1] ?? null, topics[2] ?? null]
}

/**
 * Decode a raw Transfer log into a structured object without subscribing.
 */
export function decodeTokenTransferLog(
  log: RawRpcLog | Log,
  options?: { decimals?: number; accountAddress?: Address },
): ParsedTokenTransfer | null {
  try {
    const decoded = decodeEventLog({
      abi: TRANSFER_EVENT_ABI as any,
      data: ((log as any).data ?? '0x') as Hex,
      topics: ((log as any).topics ?? []) as [Hex, ...Hex[]],
    })
    if (decoded.eventName !== 'Transfer') return null
    const from = String((decoded.args as any).from) as Address
    const to = String((decoded.args as any).to) as Address
    const value = BigInt((decoded.args as any).value)
    const decimals = options?.decimals ?? null
    const account = options?.accountAddress
    const dir = account ? directionOf(from, to, account) : 'incoming'

    return {
      tokenAddress: ((log as any).address ?? '0x') as Address,
      from,
      to,
      value,
      decimals,
      formattedValue: decimals === null ? null : formatUnits(value, decimals),
      direction: dir,
      log: {
        blockNumber:
          typeof (log as any).blockNumber === 'bigint'
            ? (log as any).blockNumber
            : (log as any).blockNumber
              ? BigInt((log as any).blockNumber)
              : null,
        transactionHash: ((log as any).transactionHash ?? null) as Hex | null,
        logIndex:
          typeof (log as any).logIndex === 'number'
            ? (log as any).logIndex
            : (log as any).logIndex != null
              ? Number(BigInt((log as any).logIndex))
              : null,
      },
    }
  } catch {
    return null
  }
}

// Re-export pad helper for advanced filter builders
export { padAddressTopic }
