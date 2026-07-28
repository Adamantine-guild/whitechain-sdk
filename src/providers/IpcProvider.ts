import type { Transport } from 'viem'
import { custom } from 'viem'
import { ValidationError, RpcError } from '../errors/index.js'

export interface IpcProviderOptions {
  path: string | number
  timeoutMs?: number
  connectFn?: (options: any, connectionListener?: () => void) => any
}

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params: unknown[]
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0'
  id: number
  result?: T
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

type IpcEventListener = (...args: any[]) => void

/**
 * IpcProvider enables high-performance local connections to Ethereum nodes (e.g. Geth, Reth)
 * via Unix domain sockets (/path/to/node.ipc) or Windows named pipes (\\\\.\\pipe\\geth.ipc).
 *
 * Uses Node.js `net` socket streams with newline-delimited framing and request ID correlation.
 * Safe for Node environments; throws WhiteChainError if instantiated in a browser.
 */
export class IpcProvider {
  public readonly path: string | number
  public readonly timeoutMs: number
  private _connectFn?: (options: any, connectionListener?: () => void) => any
  private _socket: any = null
  private _connected = false
  private _buffer = ''
  private _nextId = 1
  private _pendingRequests = new Map<number, { resolve: (res: any) => void; reject: (err: any) => void }>()
  private _listeners: Map<string, Set<IpcEventListener>> = new Map()

  constructor(options: string | number | IpcProviderOptions) {
    if (typeof window !== 'undefined') {
      throw new ValidationError('IpcProvider is only supported in Node.js environment')
    }

    if (typeof options === 'string' || typeof options === 'number') {
      this.path = options
      this.timeoutMs = 30000
    } else if (options && (typeof options.path === 'string' || typeof options.path === 'number')) {
      this.path = options.path
      this.timeoutMs = options.timeoutMs ?? 30000
      this._connectFn = options.connectFn
    } else {
      throw new ValidationError('IPC socket path must be provided to IpcProvider')
    }
  }

  public isConnected(): boolean {
    return this._connected
  }

  /**
   * Establish persistent socket connection to the target IPC path or port.
   */
  public async connect(): Promise<void> {
    if (this._connected && this._socket) return

    let net: typeof import('net')
    try {
      net = await import('node:net')
    } catch {
      throw new ValidationError('Node.js net module is unavailable in this environment')
    }

    return new Promise((resolve, reject) => {
      try {
        const isPort = typeof this.path === 'number' || (typeof this.path === 'string' && /^\d+$/.test(this.path))
        const connectOpts = isPort
          ? { port: Number(this.path), host: '127.0.0.1' }
          : { path: String(this.path) }

        const connect = this._connectFn ?? net.connect

        this._socket = connect(connectOpts as any, () => {
          this._connected = true
          this._emit('connect')
          resolve()
        })

        if (this._socket && typeof this._socket.setEncoding === 'function') {
          this._socket.setEncoding('utf8')
        }

        if (this._socket && typeof this._socket.on === 'function') {
          this._socket.on('data', (data: string) => {
            this._handleData(data)
          })

          this._socket.on('error', (err: Error) => {
            this._emit('error', err)
            if (!this._connected) {
              reject(err)
            }
          })

          this._socket.on('close', () => {
            this._connected = false
            this._socket = null
            this._emit('close')
            this._rejectAllPending(new Error('IPC socket connection closed'))
          })
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Send a JSON-RPC request over the IPC socket connection.
   */
  public async request<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    if (!this._connected || !this._socket) {
      await this.connect()
    }

    return new Promise<T>((resolve, reject) => {
      const id = this._nextId++
      const payload: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      }

      this._pendingRequests.set(id, {
        resolve: resolve as (val: any) => void,
        reject,
      })

      const jsonStr = JSON.stringify(payload) + '\n'
      this._socket.write(jsonStr, (err?: Error | null) => {
        if (err) {
          this._pendingRequests.delete(id)
          reject(err)
        }
      })
    })
  }

  /**
   * Convert this IpcProvider into a viem Transport.
   */
  public toTransport(): Transport {
    return custom({
      request: async ({ method, params }) => {
        const paramsArray = Array.isArray(params) ? params : params ? [params] : []
        return this.request(method, paramsArray)
      },
    })
  }

  /**
   * Close the active IPC socket connection and reject any pending callers.
   */
  public disconnect(): void {
    if (this._socket) {
      if (typeof this._socket.destroy === 'function') {
        this._socket.destroy()
      }
      this._socket = null
    }
    this._connected = false
    this._rejectAllPending(new Error('IpcProvider explicitly disconnected'))
  }

  public on(event: 'connect' | 'error' | 'close', listener: IpcEventListener): void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set())
    }
    this._listeners.get(event)!.add(listener)
  }

  public off(event: 'connect' | 'error' | 'close', listener: IpcEventListener): void {
    const set = this._listeners.get(event)
    if (set) {
      set.delete(listener)
    }
  }

  private _handleData(chunk: string): void {
    this._buffer += chunk
    const lines = this._buffer.split('\n')

    this._buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const response = JSON.parse(trimmed) as JsonRpcResponse
        if (response && typeof response.id === 'number') {
          const pending = this._pendingRequests.get(response.id)
          if (pending) {
            this._pendingRequests.delete(response.id)
            if (response.error) {
              pending.reject(new RpcError(`JSON-RPC Error [${response.error.code}]: ${response.error.message}`, response.error.code, response.error.data))
            } else {
              pending.resolve(response.result)
            }
          }
        }
      } catch (err) {
        // Ignore unparseable line or buffer fragment
      }
    }
  }

  private _rejectAllPending(error: Error): void {
    for (const [, pending] of this._pendingRequests) {
      pending.reject(error)
    }
    this._pendingRequests.clear()
  }

  private _emit(event: string, ...args: any[]): void {
    const listeners = this._listeners.get(event)
    if (listeners) {
      listeners.forEach((listener) => listener(...args))
    }
  }
}
