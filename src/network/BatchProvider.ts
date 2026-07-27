import type { NetworkProfile } from '../config/networks.js'

export interface BatchProviderOptions {
  rpcUrl?: string
  network?: NetworkProfile
  waitMs?: number
  maxBatchSize?: number
  fetchFn?: typeof fetch
}

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params: unknown[]
}

export interface JsonRpcSuccessResponse<T = unknown> {
  jsonrpc: '2.0'
  id: number
  result: T
  error?: undefined
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0'
  id: number
  error: {
    code: number
    message: string
    data?: unknown
  }
  result?: undefined
}

export type JsonRpcResponse<T = unknown> = JsonRpcSuccessResponse<T> | JsonRpcErrorResponse

interface QueuedItem<T = unknown> {
  id: number
  method: string
  params: unknown[]
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

/**
 * BatchProvider / MulticallProvider bundles multiple JSON-RPC calls made within a
 * configurable time tick (default 50ms) into a single HTTP POST request.
 *
 * Each response is correlated back to its caller by unique request ID, allowing
 * individual promise resolutions and rejections to remain completely independent.
 */
export class BatchProvider {
  public readonly rpcUrl: string
  public readonly waitMs: number
  public readonly maxBatchSize: number
  private _fetchFn: typeof fetch
  private _queue: QueuedItem[] = []
  private _timer: ReturnType<typeof setTimeout> | null = null
  private _nextId = 1

  constructor(options: string | NetworkProfile | BatchProviderOptions) {
    if (typeof options === 'string') {
      this.rpcUrl = options
      this.waitMs = 50
      this.maxBatchSize = 100
      this._fetchFn = globalThis.fetch
    } else if (options && typeof options === 'object') {
      const opts = options as BatchProviderOptions
      if ('rpcUrl' in opts || 'network' in opts || 'waitMs' in opts || 'fetchFn' in opts || 'maxBatchSize' in opts) {
        this.rpcUrl = opts.rpcUrl ?? opts.network?.rpcUrl ?? ''
        this.waitMs = opts.waitMs ?? 50
        this.maxBatchSize = opts.maxBatchSize ?? 100
        this._fetchFn = opts.fetchFn ?? globalThis.fetch
      } else if ('chainId' in options) {
        const net = options as NetworkProfile
        this.rpcUrl = net.rpcUrl ?? ''
        this.waitMs = 50
        this.maxBatchSize = 100
        this._fetchFn = globalThis.fetch
      } else {
        throw new Error('Invalid RPC URL or NetworkProfile provided to BatchProvider')
      }
    } else {
      throw new Error('Invalid RPC URL or NetworkProfile provided to BatchProvider')
    }

    if (!this.rpcUrl) {
      throw new Error('RPC URL is required for BatchProvider')
    }
  }

  /**
   * Queue a JSON-RPC request to be batched and sent in the current tick.
   */
  public async request<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = this._nextId++
      this._queue.push({
        id,
        method,
        params,
        resolve: resolve as (value: unknown) => void,
        reject,
      })

      if (this._queue.length >= this.maxBatchSize) {
        this._flush()
      } else if (!this._timer) {
        this._timer = setTimeout(() => this._flush(), this.waitMs)
      }
    })
  }

  /**
   * Helper method to call contract `balanceOf(address)` via standard `eth_call`.
   */
  public async balanceOf(contractAddress: string, accountAddress: string): Promise<string> {
    const cleanAddr = accountAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0')
    const data = `0x70a08231${cleanAddr}`
    return this.request<string>('eth_call', [{ to: contractAddress, data }, 'latest'])
  }

  /**
   * Immediately flush any queued requests without waiting for the timer to fire.
   */
  public async flush(): Promise<void> {
    await this._flush()
  }

  private async _flush(): Promise<void> {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }

    if (this._queue.length === 0) return

    const itemsToFlush = this._queue.splice(0, this.maxBatchSize)
    const requestMap = new Map<number, QueuedItem>()

    const payload: JsonRpcRequest[] = itemsToFlush.map((item) => {
      requestMap.set(item.id, item)
      return {
        jsonrpc: '2.0',
        id: item.id,
        method: item.method,
        params: item.params,
      }
    })

    try {
      const response = await this._fetchFn(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorMsg = `HTTP Error ${response.status}: ${response.statusText}`
        itemsToFlush.forEach((item) => item.reject(new Error(errorMsg)))
        return
      }

      const body = (await response.json()) as JsonRpcResponse[] | JsonRpcResponse

      const responses: JsonRpcResponse[] = Array.isArray(body) ? body : [body]
      const receivedIds = new Set<number>()

      for (const res of responses) {
        if (!res || typeof res.id !== 'number') continue
        receivedIds.add(res.id)

        const item = requestMap.get(res.id)
        if (!item) continue

        if (res.error) {
          item.reject(new Error(`JSON-RPC Error [${res.error.code}]: ${res.error.message}`))
        } else {
          item.resolve(res.result)
        }
      }

      for (const item of itemsToFlush) {
        if (!receivedIds.has(item.id)) {
          item.reject(new Error(`No response received for request ID ${item.id}`))
        }
      }
    } catch (err) {
      itemsToFlush.forEach((item) => item.reject(err))
    }
  }
}

/** MulticallProvider alias for BatchProvider */
export const MulticallProvider = BatchProvider
