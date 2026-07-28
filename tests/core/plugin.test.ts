import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WhitechainSDK } from '../../src/core/WhitechainSDK.js'
import type { WhitechainSDKConfig } from '../../src/core/WhitechainSDK.js'
import type { ISDKPlugin, SDKContext } from '../../src/interfaces/ISDKPlugin.js'
import { ValidationError } from '../../src/errors/index.js'

// ---------------------------------------------------------------------------
// Minimal config that avoids real network calls
// ---------------------------------------------------------------------------

/** Returns a config that injects mock viem clients, bypassing real transports. */
function makeConfig(overrides: Partial<WhitechainSDKConfig> = {}): WhitechainSDKConfig {
  return {
    clients: {
      publicClient: {
        readContract: vi.fn(),
      } as any,
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Helper plugin factories
// ---------------------------------------------------------------------------

function makePlugin(
  name: string,
  version = '1.0.0',
  onInitialize?: (ctx: SDKContext) => unknown,
): ISDKPlugin {
  return {
    name,
    version,
    onInitialize: onInitialize ?? (() => ({ hello: () => `Hello from ${name}` })),
  }
}

function makeAsyncPlugin(name: string, version = '1.0.0', delayMs = 1): ISDKPlugin {
  return {
    name,
    version,
    async onInitialize(_ctx: SDKContext) {
      await new Promise<void>((r) => setTimeout(r, delayMs))
      return { ready: true }
    },
  }
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe('WhitechainSDK — construction', () => {
  it('creates an instance with no plugins', () => {
    const sdk = new WhitechainSDK(makeConfig())
    expect(sdk).toBeInstanceOf(WhitechainSDK)
    expect(sdk.getPlugins()).toHaveLength(0)
  })

  it('exposes publicClient', () => {
    const sdk = new WhitechainSDK(makeConfig())
    expect(sdk.publicClient).toBeDefined()
  })

  it('walletClient is undefined when no account is provided', () => {
    const sdk = new WhitechainSDK(makeConfig())
    expect(sdk.walletClient).toBeUndefined()
  })

  it('walletClient is set when a walletClient is injected via clients', () => {
    const mockWallet = { writeContract: vi.fn() } as any
    const sdk = new WhitechainSDK(
      makeConfig({ clients: { publicClient: { readContract: vi.fn() } as any, walletClient: mockWallet } }),
    )
    expect(sdk.walletClient).toBe(mockWallet)
  })

  it('uses the provided network profile', () => {
    const network = {
      name: 'Test Net',
      chainId: 9999,
      rpcUrl: 'http://localhost:8545',
      blockExplorerUrl: 'http://localhost',
    }
    const sdk = new WhitechainSDK(makeConfig({ network }))
    expect(sdk.network).toBe(network)
  })

  it('uses the default console logger when none is provided', () => {
    const sdk = new WhitechainSDK(makeConfig())
    // Logger must have all four methods
    expect(typeof sdk.logger.info).toBe('function')
    expect(typeof sdk.logger.warn).toBe('function')
    expect(typeof sdk.logger.error).toBe('function')
    expect(typeof sdk.logger.debug).toBe('function')
  })

  it('uses a custom logger when provided', () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    const sdk = new WhitechainSDK(makeConfig({ logger }))
    expect(sdk.logger).toBe(logger)
  })
})

// ---------------------------------------------------------------------------
// WhitechainSDK.create (async factory)
// ---------------------------------------------------------------------------

describe('WhitechainSDK.create', () => {
  it('returns a WhitechainSDK instance', async () => {
    const sdk = await WhitechainSDK.create(makeConfig())
    expect(sdk).toBeInstanceOf(WhitechainSDK)
  })

  it('loads sync plugins', async () => {
    const plugin = makePlugin('alpha')
    const sdk = await WhitechainSDK.create(makeConfig(), [plugin])
    expect((sdk as any).alpha).toBeDefined()
    expect(sdk.getPlugins()).toHaveLength(1)
  })

  it('fully awaits async plugins before resolving', async () => {
    const resolved: string[] = []
    const slow: ISDKPlugin = {
      name: 'slow',
      version: '0.1.0',
      async onInitialize() {
        await new Promise<void>((r) => setTimeout(r, 5))
        resolved.push('slow')
        return {}
      },
    }
    const sdk = await WhitechainSDK.create(makeConfig(), [slow])
    // By the time create() resolves, the plugin must already be initialized
    expect(resolved).toContain('slow')
    expect((sdk as any).slow).toBeDefined()
  })

  it('loads multiple plugins in order', async () => {
    const order: string[] = []
    const plugins: ISDKPlugin[] = ['first', 'second', 'third'].map((n) => ({
      name: n,
      version: '1.0.0',
      onInitialize() {
        order.push(n)
        return {}
      },
    }))
    const sdk = await WhitechainSDK.create(makeConfig(), plugins)
    expect(order).toEqual(['first', 'second', 'third'])
    expect(sdk.getPlugins().map((p) => p.name)).toEqual(['first', 'second', 'third'])
  })
})

// ---------------------------------------------------------------------------
// Plugin namespace attachment
// ---------------------------------------------------------------------------

describe('WhitechainSDK — plugin namespace attachment', () => {
  it('attaches the namespace returned by onInitialize', async () => {
    const namespace = { buyNFT: vi.fn() }
    const plugin: ISDKPlugin = {
      name: 'marketplace',
      version: '1.0.0',
      onInitialize: () => namespace,
    }
    const sdk = await WhitechainSDK.create(makeConfig(), [plugin])
    expect((sdk as any).marketplace).toBe(namespace)
  })

  it('attaches an async namespace', async () => {
    const sdk = await WhitechainSDK.create(makeConfig(), [makeAsyncPlugin('defi')])
    expect((sdk as any).defi).toEqual({ ready: true })
  })

  it('different plugins get independent namespaces', async () => {
    const ns1 = { method: () => 'a' }
    const ns2 = { method: () => 'b' }
    const sdk = await WhitechainSDK.create(makeConfig(), [
      { name: 'pluginA', version: '1.0.0', onInitialize: () => ns1 },
      { name: 'pluginB', version: '1.0.0', onInitialize: () => ns2 },
    ])
    expect((sdk as any).pluginA).toBe(ns1)
    expect((sdk as any).pluginB).toBe(ns2)
  })
})

// ---------------------------------------------------------------------------
// SDKContext — plugins receive the correct context
// ---------------------------------------------------------------------------

describe('WhitechainSDK — plugin SDKContext', () => {
  it('passes publicClient to onInitialize', async () => {
    const mockPublicClient = { readContract: vi.fn() } as any
    let receivedCtx: SDKContext | undefined

    const plugin: ISDKPlugin = {
      name: 'inspector',
      version: '1.0.0',
      onInitialize(ctx) {
        receivedCtx = ctx
        return {}
      },
    }

    await WhitechainSDK.create(
      { clients: { publicClient: mockPublicClient } },
      [plugin],
    )

    expect(receivedCtx?.publicClient).toBe(mockPublicClient)
  })

  it('passes walletClient to onInitialize when provided', async () => {
    const mockWallet = { writeContract: vi.fn() } as any
    let receivedCtx: SDKContext | undefined

    const plugin: ISDKPlugin = {
      name: 'signer',
      version: '1.0.0',
      onInitialize(ctx) {
        receivedCtx = ctx
        return {}
      },
    }

    await WhitechainSDK.create(
      {
        clients: {
          publicClient: { readContract: vi.fn() } as any,
          walletClient: mockWallet,
        },
      },
      [plugin],
    )

    expect(receivedCtx?.walletClient).toBe(mockWallet)
  })

  it('passes undefined walletClient in read-only mode', async () => {
    let receivedCtx: SDKContext | undefined

    const plugin: ISDKPlugin = {
      name: 'readOnly',
      version: '1.0.0',
      onInitialize(ctx) {
        receivedCtx = ctx
        return {}
      },
    }

    await WhitechainSDK.create(makeConfig(), [plugin])

    expect(receivedCtx?.walletClient).toBeUndefined()
  })

  it('passes the network profile to onInitialize', async () => {
    const network = {
      name: 'Local',
      chainId: 1337,
      rpcUrl: 'http://127.0.0.1:8545',
      blockExplorerUrl: 'http://localhost',
    }
    let receivedCtx: SDKContext | undefined

    const plugin: ISDKPlugin = {
      name: 'netCheck',
      version: '1.0.0',
      onInitialize(ctx) {
        receivedCtx = ctx
        return {}
      },
    }

    await WhitechainSDK.create(makeConfig({ network }), [plugin])

    expect(receivedCtx?.network).toBe(network)
  })

  it('passes the logger to onInitialize', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    let receivedCtx: SDKContext | undefined

    const plugin: ISDKPlugin = {
      name: 'logCheck',
      version: '1.0.0',
      onInitialize(ctx) {
        receivedCtx = ctx
        return {}
      },
    }

    await WhitechainSDK.create(makeConfig({ logger }), [plugin])

    expect(receivedCtx?.logger).toBe(logger)
  })
})

// ---------------------------------------------------------------------------
// use() — dynamic plugin loading after construction
// ---------------------------------------------------------------------------

describe('WhitechainSDK#use()', () => {
  it('loads a plugin after construction', async () => {
    const sdk = new WhitechainSDK(makeConfig())
    expect((sdk as any).late).toBeUndefined()

    await sdk.use(makePlugin('late'))

    expect((sdk as any).late).toBeDefined()
    expect(sdk.getPlugins()).toHaveLength(1)
  })

  it('returns `this` for chaining', async () => {
    const sdk = new WhitechainSDK(makeConfig())
    const returned = await sdk.use(makePlugin('chain1'))
    expect(returned).toBe(sdk)
  })

  it('supports chaining multiple use() calls', async () => {
    const sdk = new WhitechainSDK(makeConfig())
    await sdk.use(makePlugin('x')).then((s) => s.use(makePlugin('y')))
    expect(sdk.getPlugins().map((p) => p.name)).toContain('x')
    expect(sdk.getPlugins().map((p) => p.name)).toContain('y')
  })

  it('awaits async onInitialize before resolving', async () => {
    const sdk = new WhitechainSDK(makeConfig())
    const resolved: boolean[] = []
    const plugin: ISDKPlugin = {
      name: 'asyncLate',
      version: '1.0.0',
      async onInitialize() {
        await new Promise<void>((r) => setTimeout(r, 5))
        resolved.push(true)
        return {}
      },
    }
    await sdk.use(plugin)
    expect(resolved).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// getPlugins()
// ---------------------------------------------------------------------------

describe('WhitechainSDK#getPlugins()', () => {
  it('returns an empty array before any plugins are loaded', () => {
    const sdk = new WhitechainSDK(makeConfig())
    expect(sdk.getPlugins()).toEqual([])
  })

  it('returns correct metadata for loaded plugins', async () => {
    const sdk = await WhitechainSDK.create(makeConfig(), [
      makePlugin('alpha', '1.2.3'),
      makePlugin('beta', '0.0.1'),
    ])
    const plugins = sdk.getPlugins()
    expect(plugins).toHaveLength(2)
    expect(plugins[0]).toEqual({ name: 'alpha', version: '1.2.3' })
    expect(plugins[1]).toEqual({ name: 'beta', version: '0.0.1' })
  })

  it('returns a defensive copy — mutating it does not affect internal state', () => {
    const sdk = new WhitechainSDK(makeConfig())
    const copy = sdk.getPlugins() as PluginMeta[]
    copy.push({ name: 'hack', version: '0.0.0' })
    expect(sdk.getPlugins()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

describe('WhitechainSDK — plugin validation', () => {
  it('throws ValidationError for a null plugin', async () => {
    const sdk = new WhitechainSDK(makeConfig())
    await expect(sdk.use(null as any)).rejects.toBeInstanceOf(ValidationError)
  })

  it('throws ValidationError when name is missing', async () => {
    const sdk = new WhitechainSDK(makeConfig())
    await expect(sdk.use({ name: '', version: '1.0.0', onInitialize: () => ({}) })).rejects.toBeInstanceOf(ValidationError)
  })

  it('throws ValidationError when version is missing', async () => {
    const sdk = new WhitechainSDK(makeConfig())
    await expect(sdk.use({ name: 'noVersion', version: '', onInitialize: () => ({}) })).rejects.toBeInstanceOf(ValidationError)
  })

  it('throws ValidationError when onInitialize is not a function', async () => {
    const sdk = new WhitechainSDK(makeConfig())
    await expect(sdk.use({ name: 'bad', version: '1.0.0', onInitialize: 'not-a-fn' as any })).rejects.toBeInstanceOf(ValidationError)
  })

  it.each([
    'publicClient',
    'walletClient',
    'network',
    'logger',
    'use',
    'getPlugins',
  ])('throws ValidationError for reserved name "%s"', async (reservedName) => {
    const sdk = new WhitechainSDK(makeConfig())
    const plugin = makePlugin(reservedName)
    await expect(sdk.use(plugin)).rejects.toBeInstanceOf(ValidationError)
    await expect(sdk.use(plugin)).rejects.toThrow(`"${reservedName}" is reserved`)
  })

  it('throws ValidationError when the same plugin name is registered twice', async () => {
    const sdk = new WhitechainSDK(makeConfig())
    await sdk.use(makePlugin('dupe'))
    await expect(sdk.use(makePlugin('dupe'))).rejects.toBeInstanceOf(ValidationError)
    await expect(sdk.use(makePlugin('dupe'))).rejects.toThrow('already registered')
  })

  it('throws ValidationError when onInitialize throws', async () => {
    const sdk = new WhitechainSDK(makeConfig())
    const badPlugin: ISDKPlugin = {
      name: 'crasher',
      version: '1.0.0',
      onInitialize() {
        throw new Error('boom')
      },
    }
    await expect(sdk.use(badPlugin)).rejects.toBeInstanceOf(ValidationError)
    await expect(sdk.use(badPlugin)).rejects.toThrow('boom')
  })

  it('throws ValidationError when async onInitialize rejects', async () => {
    const sdk = new WhitechainSDK(makeConfig())
    const asyncCrasher: ISDKPlugin = {
      name: 'asyncCrasher',
      version: '1.0.0',
      async onInitialize() {
        await new Promise<void>((r) => setTimeout(r, 1))
        throw new Error('async boom')
      },
    }
    await expect(sdk.use(asyncCrasher)).rejects.toBeInstanceOf(ValidationError)
  })
})

// ---------------------------------------------------------------------------
// Logger integration
// ---------------------------------------------------------------------------

describe('WhitechainSDK — logger integration', () => {
  it('calls logger.debug when a plugin is loaded', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    const sdk = new WhitechainSDK(makeConfig({ logger }))
    await sdk.use(makePlugin('loggable', '2.0.0'))

    // Two debug calls: "Loading…" and "loaded successfully"
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('loggable@2.0.0'))
  })
})

// ---------------------------------------------------------------------------
// No-plugin isolation — core bundle unaffected
// ---------------------------------------------------------------------------

describe('WhitechainSDK — core isolation', () => {
  it('SDK has no plugin properties when no plugins are loaded', () => {
    const sdk = new WhitechainSDK(makeConfig())
    // Only built-in properties should exist
    const ownKeys = Object.keys(sdk)
    const pluginKeys = ownKeys.filter(
      (k) => !['publicClient', 'walletClient', 'network', 'logger', '_plugins'].includes(k),
    )
    expect(pluginKeys).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Type helpers re-exported from test file for TS check (no runtime effect)
// ---------------------------------------------------------------------------
import type { PluginMeta } from '../../src/interfaces/ISDKPlugin.js'

// Compile-time check: PluginMeta is structurally { name: string; version: string }
const _meta: PluginMeta = { name: 'test', version: '0.0.0' }
void _meta
