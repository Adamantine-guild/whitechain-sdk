import {
  decodeEventLog,
  toEventSelector,
  type Abi,
  type Address,
  type Hex,
  type Log,
} from 'viem'
import { ValidationError } from '../errors/index.js'
import type {
  AbiEventItem,
  DecodedEventArgs,
  EventCallback,
  EventLogClient,
  EventManagerOptions,
  RawRpcLog,
  TypedEventLog,
  Unsubscribe,
} from './types.js'

type ListenerEntry = {
  eventName: string
  eventAbi: AbiEventItem
  topic0: Hex
  callback: EventCallback
}

function isEventItem(item: unknown): item is AbiEventItem {
  return (
    !!item &&
    typeof item === 'object' &&
    (item as AbiEventItem).type === 'event' &&
    typeof (item as AbiEventItem).name === 'string'
  )
}

function hexToBigInt(value: string | null | undefined): bigint | null {
  if (value === null || value === undefined || value === '0x') return null
  try {
    return BigInt(value)
  } catch {
    return null
  }
}

function hexToNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value
  try {
    return Number(BigInt(value))
  } catch {
    return null
  }
}

function normalizeLog(raw: RawRpcLog | Log): TypedEventLog['log'] {
  const topics = ((raw as any).topics ?? []) as readonly Hex[]
  return {
    address: ((raw as any).address ?? '0x') as Address,
    blockNumber:
      typeof (raw as any).blockNumber === 'bigint'
        ? (raw as any).blockNumber
        : hexToBigInt((raw as any).blockNumber),
    blockHash: ((raw as any).blockHash ?? null) as Hex | null,
    transactionHash: ((raw as any).transactionHash ?? null) as Hex | null,
    logIndex:
      typeof (raw as any).logIndex === 'number'
        ? (raw as any).logIndex
        : hexToNumber((raw as any).logIndex),
    topics,
    data: ((raw as any).data ?? '0x') as Hex,
  }
}

/**
 * Strongly typed contract event subscription manager.
 *
 * ```ts
 * const events = new EventManager({ address, abi, client })
 * const stop = events.on('Deposit', ({ args }) => console.log(args.amount))
 * // later:
 * stop()
 * ```
 *
 * - Derives event signatures from the ABI (`abitype` / viem)
 * - Auto-decodes log topics + data into named argument objects
 * - Supports HTTP polling and optional WebSocket log subscriptions
 * - Re-polls after transport errors; WS re-subscribe is delegated to `subscribeLogs`
 */
export class EventManager {
  public readonly address: Address
  public readonly abi: Abi
  public readonly client: EventLogClient
  public readonly pollingIntervalMs: number
  public readonly onError?: (error: unknown) => void

  private readonly _eventsByName = new Map<string, AbiEventItem>()
  private readonly _listeners = new Map<string, Set<ListenerEntry>>()
  private readonly _unsubscribers = new Map<ListenerEntry, Unsubscribe>()
  private _pollTimer: ReturnType<typeof setInterval> | null = null
  private _fromBlock: bigint | 'latest'
  private _lastPolledBlock: bigint | null = null
  private _subscribeLogs?: EventManagerOptions['subscribeLogs']
  private _polling = false

  constructor(options: EventManagerOptions) {
    if (!options?.address) {
      throw new ValidationError('EventManager requires a contract address')
    }
    if (!options?.abi || !Array.isArray(options.abi)) {
      throw new ValidationError('EventManager requires a contract ABI array')
    }
    if (!options?.client) {
      throw new ValidationError('EventManager requires a client with request/getLogs')
    }

    this.address = options.address
    this.abi = options.abi
    this.client = options.client
    this.pollingIntervalMs = options.pollingIntervalMs ?? 4000
    this.onError = options.onError
    this._subscribeLogs = options.subscribeLogs
    this._fromBlock = options.fromBlock === undefined ? 'latest' : options.fromBlock === 'latest'
      ? 'latest'
      : BigInt(options.fromBlock)

    for (const item of options.abi) {
      if (isEventItem(item)) {
        this._eventsByName.set(item.name, item)
      }
    }
  }

  /** Event names present on the configured ABI. */
  public listEventNames(): string[] {
    return Array.from(this._eventsByName.keys())
  }

  /**
   * Subscribe to a named event. Callback receives fully decoded args.
   * Returns an `unsubscribe()` function to remove this listener.
   */
  public on<TArgs extends DecodedEventArgs = DecodedEventArgs>(
    eventName: string,
    callback: EventCallback<TArgs>,
  ): Unsubscribe {
    const eventAbi = this._eventsByName.get(eventName)
    if (!eventAbi) {
      throw new ValidationError(
        `Event "${eventName}" not found in contract ABI. Known: ${this.listEventNames().join(', ') || '(none)'}`,
      )
    }

    const topic0 = toEventSelector(eventAbi as any) as Hex
    const entry: ListenerEntry = {
      eventName,
      eventAbi,
      topic0,
      callback: callback as EventCallback,
    }

    let set = this._listeners.get(eventName)
    if (!set) {
      set = new Set()
      this._listeners.set(eventName, set)
    }
    set.add(entry)

    // Prefer WS subscription when available
    if (this._subscribeLogs) {
      const maybe = this._subscribeLogs(
        { address: this.address, topics: [topic0] },
        (raw) => {
          void this._dispatchRaw(raw, entry)
        },
      )
      Promise.resolve(maybe)
        .then((unsub) => {
          this._unsubscribers.set(entry, unsub)
        })
        .catch((err) => this.onError?.(err))
    } else {
      this._ensurePolling()
    }

    let active = true
    return () => {
      if (!active) return
      active = false
      this._removeListener(entry)
    }
  }

  /**
   * Remove all listeners for an event name, or all listeners when omitted.
   */
  public removeAllListeners(eventName?: string): void {
    if (eventName) {
      const set = this._listeners.get(eventName)
      if (!set) return
      for (const entry of Array.from(set)) {
        this._removeListener(entry)
      }
      return
    }
    for (const set of Array.from(this._listeners.values())) {
      for (const entry of Array.from(set)) {
        this._removeListener(entry)
      }
    }
  }

  /** Tear down timers and all subscriptions. */
  public destroy(): void {
    this.removeAllListeners()
    this._stopPolling()
  }

  private _removeListener(entry: ListenerEntry): void {
    const set = this._listeners.get(entry.eventName)
    set?.delete(entry)
    if (set && set.size === 0) {
      this._listeners.delete(entry.eventName)
    }
    const unsub = this._unsubscribers.get(entry)
    if (unsub) {
      try {
        unsub()
      } catch (err) {
        this.onError?.(err)
      }
      this._unsubscribers.delete(entry)
    }
    if (this._listeners.size === 0) {
      this._stopPolling()
    }
  }

  private _ensurePolling(): void {
    if (this._pollTimer || this._subscribeLogs) return
    // Immediate first poll, then interval
    void this._pollOnce()
    this._pollTimer = setInterval(() => {
      void this._pollOnce()
    }, this.pollingIntervalMs)
  }

  private _stopPolling(): void {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
  }

  private async _getBlockNumber(): Promise<bigint> {
    if (typeof this.client.getBlockNumber === 'function') {
      return this.client.getBlockNumber()
    }
    if (typeof this.client.request === 'function') {
      const hex = (await this.client.request({ method: 'eth_blockNumber', params: [] })) as string
      return BigInt(hex)
    }
    throw new ValidationError('EventManager client cannot resolve block number')
  }

  private async _getLogs(params: {
    fromBlock: bigint
    toBlock: bigint
    topics: (Hex | null)[]
  }): Promise<RawRpcLog[]> {
    if (typeof this.client.getLogs === 'function') {
      const logs = await this.client.getLogs({
        address: this.address,
        fromBlock: params.fromBlock,
        toBlock: params.toBlock,
      })
      // Filter topic0 client-side when using getLogs without events filter
      return logs.filter((l) => {
        const t0 = l.topics?.[0]
        return !params.topics[0] || t0 === params.topics[0]
      }) as unknown as RawRpcLog[]
    }

    if (typeof this.client.request !== 'function') {
      throw new ValidationError('EventManager client must implement request or getLogs')
    }

    const result = (await this.client.request({
      method: 'eth_getLogs',
      params: [
        {
          address: this.address,
          fromBlock: `0x${params.fromBlock.toString(16)}`,
          toBlock: `0x${params.toBlock.toString(16)}`,
          topics: params.topics,
        },
      ],
    })) as RawRpcLog[]

    return Array.isArray(result) ? result : []
  }

  private async _pollOnce(): Promise<void> {
    if (this._polling || this._listeners.size === 0) return
    this._polling = true
    try {
      const latest = await this._getBlockNumber()
      let from: bigint
      if (this._lastPolledBlock !== null) {
        from = this._lastPolledBlock + 1n
      } else if (this._fromBlock === 'latest') {
        // First poll: only observe from current head (avoid historical flood)
        this._lastPolledBlock = latest
        return
      } else {
        from = this._fromBlock
      }

      if (from > latest) return

      // Group listeners by topic0 to minimize RPC fan-out
      const byTopic = new Map<Hex, ListenerEntry[]>()
      for (const set of this._listeners.values()) {
        for (const entry of set) {
          const list = byTopic.get(entry.topic0) ?? []
          list.push(entry)
          byTopic.set(entry.topic0, list)
        }
      }

      for (const [topic0, entries] of byTopic) {
        const logs = await this._getLogs({
          fromBlock: from,
          toBlock: latest,
          topics: [topic0],
        })
        for (const raw of logs) {
          for (const entry of entries) {
            await this._dispatchRaw(raw, entry)
          }
        }
      }

      this._lastPolledBlock = latest
    } catch (err) {
      this.onError?.(err)
    } finally {
      this._polling = false
    }
  }

  private async _dispatchRaw(raw: RawRpcLog | Log, entry: ListenerEntry): Promise<void> {
    if ((raw as RawRpcLog).removed) return

    try {
      const decoded = decodeEventLog({
        abi: this.abi,
        data: ((raw as any).data ?? '0x') as Hex,
        topics: ((raw as any).topics ?? []) as [Hex, ...Hex[]],
      })

      if (decoded.eventName !== entry.eventName) return

      const payload: TypedEventLog = {
        eventName: decoded.eventName,
        args: (decoded.args ?? {}) as DecodedEventArgs,
        log: normalizeLog(raw),
      }

      await entry.callback(payload)
    } catch (err) {
      this.onError?.(err)
    }
  }

  /**
   * Decode a single raw log against this manager's ABI (utility for tests / offline use).
   */
  public decodeLog(raw: RawRpcLog | Log): TypedEventLog | null {
    try {
      const decoded = decodeEventLog({
        abi: this.abi,
        data: ((raw as any).data ?? '0x') as Hex,
        topics: ((raw as any).topics ?? []) as [Hex, ...Hex[]],
      })
      return {
        eventName: decoded.eventName,
        args: (decoded.args ?? {}) as DecodedEventArgs,
        log: normalizeLog(raw),
      }
    } catch {
      return null
    }
  }
}

export function createEventManager(options: EventManagerOptions): EventManager {
  return new EventManager(options)
}
