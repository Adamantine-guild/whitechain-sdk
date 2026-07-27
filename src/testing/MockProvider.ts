import { custom, type Transport } from 'viem'

export function returns(data: any) {
  return () => data
}

export interface JsonRpcRequest {
  jsonrpc?: '2.0'
  id?: number | string
  method: string
  params?: unknown[] | Record<string, unknown>
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0'
  id: number | string | null
  result?: T
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

export class MockProvider {
  private mocks: Map<string, Function> = new Map()

  /**
   * Register a mock response or handler for a specific JSON-RPC method.
   */
  public on(method: string, handler: Function): this {
    this.mocks.set(method, handler)
    return this
  }

  /**
   * Execute a JSON-RPC request against the registered mocks.
   * Strictly validates the basic standard JSON-RPC schema for requests.
   */
  public async request(args: JsonRpcRequest): Promise<unknown> {
    // Strictly match standard JSON-RPC schema if it contains jsonrpc or id
    if (!args || typeof args !== 'object') {
      throw { code: -32600, message: 'Invalid Request' }
    }
    if (typeof args.method !== 'string') {
      throw { code: -32600, message: 'Invalid Request: method must be a string' }
    }
    if (args.jsonrpc !== undefined && args.jsonrpc !== '2.0') {
      throw { code: -32600, message: 'Invalid Request: jsonrpc must be exactly "2.0"' }
    }
    if (args.params !== undefined && typeof args.params !== 'object') {
      // params must be array or object (which typeof array is object)
      throw { code: -32600, message: 'Invalid Request: params must be an Array or Object' }
    }

    const { method, params } = args

    if (this.mocks.has(method)) {
      const handler = this.mocks.get(method)!
      return handler(params)
    }

    throw { code: -32601, message: `Method not found: ${method}` }
  }

  /**
   * Alias for request to match some older provider interfaces (e.g. ethers v5).
   */
  public async send(method: string, params: any[] = []): Promise<unknown> {
    return this.request({ method, params })
  }

  /**
   * Convert to a viem Transport for testing viem clients.
   */
  public toTransport(): Transport {
    return custom({
      request: async (args) => {
        return this.request(args as JsonRpcRequest)
      },
    })
  }
}
