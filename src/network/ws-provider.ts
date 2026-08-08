import { ValidationError } from '../errors/index.js'

export type WsReadyState = 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting'

export type WsProviderEvent =
  | 'open'
  | 'close'
  | 'error'
  | 'message'
  | 'reconnecting'
  | 'reconnected'
  | 'subscription'
  | 'maxReconnectsReached'

export type WsEventListener = (...args: unknown[]) => void

export interface WsProviderOptions {
  /** WebSocket endpoint URL (ws:// or wss://). */
  url: string
  /**
   * Maximum consecutive reconnect attempts before giving up.
   * Use `Infinity` to keep retrying (still rate-limited by backoff + maxDelay).
   * Default: 10
   */
  maxReconnectAttempts?: number
  /** Initial reconnect delay in ms (default: 500). */
  initialDelayMs?: number
  /** Cap on reconnect delay in ms (default: 30_000). */
  maxDelayMs?: number
  /**
   * Multiplier applied each failed attempt (default: 2).
   * Delay formula: min(maxDelay, initialDelay * multiplier^attempt) ± jitter.
   */
  backoffMultiplier?: number
  /**
   * Jitter ratio 0–1 applied to each delay to avoid reconnect storms.
   * Default: 0.2 (±20%).
   */
  jitterRatio?: number
  /**
   * Optional WebSocket factory for testing or custom runtimes.
   * Defaults to global `WebSocket` (browser / Node 22+) or `ws` package in Node.
   */
  webSocketFactory?: (url: string) => WebSocketLike
  /** Heartbeat / ping interval in ms. 0 disables (default: 0). */
  heartbeatIntervalMs?: number
  /** Auto-connect on construct (default: true). */
  autoConnect?: boolean
}

/** Minimal WebSocket surface used by the provider (browser + `ws` compatible). */
export interface WebSocketLike {
  readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener?(type: string, listener: (event: any) => void): void
  removeEventListener?(type: string, listener: (event: any) => void): void
  on?(event: string, listener: (...args: any[]) => void): void
  off?(event: string, listener: (...args: any[]) => void): void
  removeListener?(event: string, listener: (...args: any[]) => void): void
  onopen?: ((event: any) => void) | null
  onclose?: ((event: any) => void) | null
  onerror?: ((event: any) => void) | null
  onmessage?: ((event: any) => void) | null
}

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params: unknown[]
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0'
  id?: number
  result?: T
  error?: {
    code: number
    message: string
    data?: unknown
  }
  method?: string
  params?: {
    subscription?: string
    result?: unknown
  }
}

export interface ActiveSubscription {
  /** Local handle returned to the caller (stable across reconnects). */
  localId: string
  /** eth_subscribe method params, e.g. ['newHeads'] or ['logs', filter]. */
  params: unknown[]
  /** Remote subscription id from the node (changes after re-subscribe). */
  remoteId?: string
  /** Handler for subscription notification payloads. */
  handler: (result: unknown) => void
}

const WS_OPEN = 1

function defaultDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number,
  jitterRatio: number,
): number {
  const base = Math.min(maxDelayMs, initialDelayMs * Math.pow(backoffMultiplier, attempt))
  if (jitterRatio <= 0) return base
  const jitter = base * jitterRatio * (Math.random() * 2 - 1)
  return Math.max(0, Math.round(base + jitter))
}

/**
 * WebSocket JSON-RPC provider with automatic reconnect and subscription restore.
 *
 * - Listens for `close` / `error` and schedules a reconnect with exponential backoff + jitter
 * - Caps reconnect frequency via `maxDelayMs` and optional `maxReconnectAttempts` to prevent spam
 * - Preserves active subscription intent and re-issues `eth_subscribe` after reconnect
 * - Maps remote subscription ids so notification handlers keep working across reconnects
 */
export class WsProvider {
  public readonly url: string
  public readonly maxReconnectAttempts: number
  public readonly initialDelayMs: number
  public readonly maxDelayMs: number
  public readonly backoffMultiplier: number
  public readonly jitterRatio: number
  public readonly heartbeatIntervalMs: number

  private _webSocketFactory?: (url: string) => WebSocketLike
  private _socket: WebSocketLike | null = null
  private _state: WsReadyState = 'closed'
  private _nextId = 1
  private _nextLocalSubId = 1
  private _pending = new Map<
    number,
    {
      resolve: (value: unknown) => void
      reject: (err: Error) => void
      method: string
      params: unknown[]
    }
  >()
  private _subscriptions = new Map<string, ActiveSubscription>()
  /** remoteId -> localId */
  private _remoteToLocal = new Map<string, string>()
  private _listeners = new Map<WsProviderEvent, Set<WsEventListener>>()
  private _reconnectAttempt = 0
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private _intentionalClose = false
  private _connectPromise: Promise<void> | null = null
  /** Injected delay calculator for deterministic tests. */
  private _delayFn: typeof defaultDelay = defaultDelay

  constructor(options: string | WsProviderOptions) {
    if (typeof options === 'string') {
      this.url = options
      this.maxReconnectAttempts = 10
      this.initialDelayMs = 500
      this.maxDelayMs = 30_000
      this.backoffMultiplier = 2
      this.jitterRatio = 0.2
      this.heartbeatIntervalMs = 0
    } else if (options && typeof options.url === 'string') {
      this.url = options.url
      this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10
      this.initialDelayMs = options.initialDelayMs ?? 500
      this.maxDelayMs = options.maxDelayMs ?? 30_000
      this.backoffMultiplier = options.backoffMultiplier ?? 2
      this.jitterRatio = options.jitterRatio ?? 0.2
      this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 0
      this._webSocketFactory = options.webSocketFactory
      if (options.autoConnect !== false) {
        // Fire-and-forget; consumers can await `connect()` / `waitUntilOpen()`.
        void this.connect()
      }
    } else {
      throw new ValidationError('WebSocket URL must be provided to WsProvider')
    }

    if (!this.url.startsWith('ws://') && !this.url.startsWith('wss://')) {
      throw new ValidationError(`Invalid WebSocket URL (expected ws:// or wss://): ${this.url}`)
    }
  }

  /** Test-only: override backoff delay computation. */
  public setDelayFn(fn: typeof defaultDelay): void {
    this._delayFn = fn
  }

  public get readyState(): WsReadyState {
    return this._state
  }

  public isConnected(): boolean {
    return this._state === 'open' && this._socket !== null && this._socket.readyState === WS_OPEN
  }

  public on(event: WsProviderEvent, listener: WsEventListener): () => void {
    let set = this._listeners.get(event)
    if (!set) {
      set = new Set()
      this._listeners.set(event, set)
    }
    set.add(listener)
    return () => this.off(event, listener)
  }

  public off(event: WsProviderEvent, listener: WsEventListener): void {
    this._listeners.get(event)?.delete(listener)
  }

  private _emit(event: WsProviderEvent, ...args: unknown[]): void {
    const set = this._listeners.get(event)
    if (!set) return
    for (const listener of set) {
      try {
        listener(...args)
      } catch {
        // Listener errors must not break the provider loop.
      }
    }
  }

  public async connect(): Promise<void> {
    if (this._state === 'open' && this._socket) return
    if (this._connectPromise) return this._connectPromise

    this._intentionalClose = false
    this._connectPromise = this._openSocket()
      .catch((err) => {
        this._connectPromise = null
        throw err
      })
      .then(() => {
        this._connectPromise = null
      })

    return this._connectPromise
  }

  public async waitUntilOpen(timeoutMs = 15_000): Promise<void> {
    if (this.isConnected()) return
    await this.connect()
    if (this.isConnected()) return

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new ValidationError(`Timed out waiting for WebSocket open: ${this.url}`))
      }, timeoutMs)

      const onOpen = () => {
        cleanup()
        resolve()
      }
      const onClose = () => {
        // Keep waiting through reconnects until timeout.
      }

      const cleanup = () => {
        clearTimeout(timer)
        this.off('open', onOpen)
        this.off('reconnected', onOpen)
        this.off('close', onClose)
      }

      this.on('open', onOpen)
      this.on('reconnected', onOpen)
      this.on('close', onClose)
    })
  }

  private async _resolveFactory(): Promise<(url: string) => WebSocketLike> {
    if (this._webSocketFactory) return this._webSocketFactory

    const g: any = globalThis as any
    if (typeof g.WebSocket === 'function') {
      return (url: string) => new g.WebSocket(url) as WebSocketLike
    }

    try {
      const wsMod = await import('ws')
      const WS = (wsMod as any).default ?? wsMod
      return (url: string) => new WS(url) as WebSocketLike
    } catch {
      throw new ValidationError(
        'No WebSocket implementation available. Provide webSocketFactory or install the `ws` package.',
      )
    }
  }

  private async _openSocket(): Promise<void> {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }

    this._state = this._reconnectAttempt > 0 ? 'reconnecting' : 'connecting'
    const factory = await this._resolveFactory()

    return new Promise((resolve, reject) => {
      let settled = false
      let socket: WebSocketLike

      try {
        socket = factory(this.url)
      } catch (err: any) {
        this._state = 'closed'
        reject(err instanceof Error ? err : new Error(String(err)))
        return
      }

      this._socket = socket

      const onOpen = () => {
        if (settled) return
        settled = true
        const wasReconnect = this._reconnectAttempt > 0
        this._reconnectAttempt = 0
        this._state = 'open'
        this._startHeartbeat()
        this._emit(wasReconnect ? 'reconnected' : 'open')
        // Re-subscribe after open; do not block open resolution on subscription RPCs.
        void this._restoreSubscriptions()
        resolve()
      }

      const onError = (event: unknown) => {
        this._emit('error', event)
        if (!settled && this._state === 'connecting') {
          settled = true
          this._state = 'closed'
          reject(new ValidationError(`WebSocket connection failed: ${this.url}`))
        }
      }

      const onClose = (event: unknown) => {
        this._stopHeartbeat()
        this._rejectPending(new ValidationError('WebSocket connection closed'))
        this._socket = null
        this._state = 'closed'
        this._emit('close', event)

        if (!this._intentionalClose) {
          this._scheduleReconnect()
        }

        if (!settled) {
          settled = true
          reject(new ValidationError(`WebSocket closed before open: ${this.url}`))
        }
      }

      const onMessage = (event: any) => {
        const raw = typeof event === 'string' ? event : event?.data ?? event
        this._handleMessage(raw)
      }

      this._attachSocketHandlers(socket, { onOpen, onClose, onError, onMessage })
    })
  }

  private _attachSocketHandlers(
    socket: WebSocketLike,
    handlers: {
      onOpen: () => void
      onClose: (event: unknown) => void
      onError: (event: unknown) => void
      onMessage: (event: unknown) => void
    },
  ): void {
    if (typeof socket.addEventListener === 'function') {
      socket.addEventListener('open', handlers.onOpen)
      socket.addEventListener('close', handlers.onClose)
      socket.addEventListener('error', handlers.onError)
      socket.addEventListener('message', handlers.onMessage)
      return
    }

    if (typeof socket.on === 'function') {
      socket.on('open', handlers.onOpen)
      socket.on('close', handlers.onClose)
      socket.on('error', handlers.onError)
      socket.on('message', handlers.onMessage)
      return
    }

    socket.onopen = handlers.onOpen
    socket.onclose = handlers.onClose
    socket.onerror = handlers.onError
    socket.onmessage = handlers.onMessage
  }

  private _scheduleReconnect(): void {
    if (this._intentionalClose) return
    if (this._reconnectTimer) return

    // `_reconnectAttempt` counts completed failed reconnect cycles.
    // Before scheduling the next try, if we've already hit the cap, stop.
    if (
      Number.isFinite(this.maxReconnectAttempts) &&
      this._reconnectAttempt >= this.maxReconnectAttempts
    ) {
      this._state = 'closed'
      this._emit('maxReconnectsReached', this._reconnectAttempt)
      return
    }

    const attempt = this._reconnectAttempt
    const delay = this._delayFn(
      attempt,
      this.initialDelayMs,
      this.maxDelayMs,
      this.backoffMultiplier,
      this.jitterRatio,
    )

    this._state = 'reconnecting'
    this._emit('reconnecting', { attempt: attempt + 1, delayMs: delay })

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null
      // Count this scheduled try as a reconnect attempt (success resets to 0 in onOpen).
      this._reconnectAttempt = attempt + 1
      void this._openSocket().catch(() => {
        // Failure is handled via close/error paths which re-schedule.
        if (!this._intentionalClose && !this._reconnectTimer) {
          this._scheduleReconnect()
        }
      })
    }, delay)
  }

  private _startHeartbeat(): void {
    this._stopHeartbeat()
    if (!this.heartbeatIntervalMs || this.heartbeatIntervalMs <= 0) return

    this._heartbeatTimer = setInterval(() => {
      if (!this.isConnected()) return
      // Lightweight keep-alive: eth_chainId is universally supported.
      void this.request('eth_chainId', []).catch(() => {
        // Ignore; close handler will reconnect if the socket is dead.
      })
    }, this.heartbeatIntervalMs)
  }

  private _stopHeartbeat(): void {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer)
      this._heartbeatTimer = null
    }
  }

  private _rejectPending(err: Error): void {
    for (const [, pending] of this._pending) {
      pending.reject(err)
    }
    this._pending.clear()
  }

  private _handleMessage(raw: unknown): void {
    let text: string
    if (typeof raw === 'string') {
      text = raw
    } else if (raw && typeof (raw as any).toString === 'function') {
      text = String(raw)
    } else {
      return
    }

    let payload: JsonRpcResponse
    try {
      payload = JSON.parse(text) as JsonRpcResponse
    } catch {
      this._emit('message', text)
      return
    }

    this._emit('message', payload)

    // eth_subscription notification
    if (
      payload.method === 'eth_subscription' &&
      payload.params &&
      typeof payload.params.subscription === 'string'
    ) {
      const remoteId = payload.params.subscription
      const localId = this._remoteToLocal.get(remoteId)
      if (localId) {
        const sub = this._subscriptions.get(localId)
        if (sub) {
          try {
            sub.handler(payload.params.result)
          } catch {
            // swallow handler errors
          }
          this._emit('subscription', { localId, remoteId, result: payload.params.result })
        }
      }
      return
    }

    if (typeof payload.id === 'number') {
      const pending = this._pending.get(payload.id)
      if (!pending) return
      this._pending.delete(payload.id)
      if (payload.error) {
        pending.reject(
          new ValidationError(
            `JSON-RPC Error [${payload.error.code}]: ${payload.error.message}`,
          ),
        )
      } else {
        pending.resolve(payload.result)
      }
    }
  }

  /**
   * Send a JSON-RPC request over the active WebSocket.
   * Connects automatically if needed.
   */
  public async request<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    if (!this.isConnected()) {
      await this.connect()
      await this.waitUntilOpen()
    }

    const socket = this._socket
    if (!socket || socket.readyState !== WS_OPEN) {
      throw new ValidationError('WebSocket is not open')
    }

    const id = this._nextId++
    const payload: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    }

    return new Promise<T>((resolve, reject) => {
      this._pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        method,
        params,
      })
      try {
        socket.send(JSON.stringify(payload))
      } catch (err: any) {
        this._pending.delete(id)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  /**
   * Subscribe to an eth_subscribe stream. Returns a stable local subscription id.
   * On reconnect, the provider re-subscribes with the same params and rewires handlers.
   */
  public async subscribe(
    params: unknown[],
    handler: (result: unknown) => void,
  ): Promise<string> {
    const localId = `local-${this._nextLocalSubId++}`
    const sub: ActiveSubscription = {
      localId,
      params,
      handler,
    }
    this._subscriptions.set(localId, sub)

    const remoteId = await this.request<string>('eth_subscribe', params)
    sub.remoteId = remoteId
    this._remoteToLocal.set(remoteId, localId)
    return localId
  }

  /**
   * Unsubscribe by local subscription id (the handle returned from `subscribe`).
   */
  public async unsubscribe(localId: string): Promise<boolean> {
    const sub = this._subscriptions.get(localId)
    if (!sub) return false

    this._subscriptions.delete(localId)
    if (sub.remoteId) {
      this._remoteToLocal.delete(sub.remoteId)
      try {
        if (this.isConnected()) {
          await this.request<boolean>('eth_unsubscribe', [sub.remoteId])
        }
      } catch {
        // Best-effort unsubscribe on a live connection.
      }
    }
    return true
  }

  /** Active local subscription ids (stable across reconnects). */
  public getActiveSubscriptionIds(): string[] {
    return Array.from(this._subscriptions.keys())
  }

  private async _restoreSubscriptions(): Promise<void> {
    // Drop stale remote id mappings; new ones will be assigned.
    this._remoteToLocal.clear()

    for (const sub of this._subscriptions.values()) {
      sub.remoteId = undefined
      try {
        const remoteId = await this.request<string>('eth_subscribe', sub.params)
        sub.remoteId = remoteId
        this._remoteToLocal.set(remoteId, sub.localId)
      } catch (err) {
        this._emit('error', err)
      }
    }
  }

  /**
   * Gracefully close the connection. Disables auto-reconnect until `connect()` is called again.
   * Pending subscriptions are retained in memory so a later `connect()` restores them.
   */
  public disconnect(code?: number, reason?: string): void {
    this._intentionalClose = true
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    this._stopHeartbeat()
    this._rejectPending(new ValidationError('WebSocket disconnected by client'))

    if (this._socket) {
      this._state = 'closing'
      try {
        this._socket.close(code, reason)
      } catch {
        // ignore
      }
      this._socket = null
    }
    this._state = 'closed'
  }

  /**
   * Fully tear down the provider: disconnect, clear subscriptions, remove listeners.
   */
  public destroy(): void {
    this._subscriptions.clear()
    this._remoteToLocal.clear()
    this.disconnect()
    this._listeners.clear()
  }
}

export function createWsProvider(options: string | WsProviderOptions): WsProvider {
  return new WsProvider(typeof options === 'string' ? { url: options, autoConnect: false } : options)
}

export { defaultDelay as computeReconnectDelay }
