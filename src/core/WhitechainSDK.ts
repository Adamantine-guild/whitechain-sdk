import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Chain,
  type Transport,
  type Account,
  type Address,
} from 'viem'
import type { NetworkProfile } from '../config/networks.js'
import type { ISDKPlugin, SDKContext, SDKLogger, PluginMeta } from '../interfaces/ISDKPlugin.js'
import { ValidationError } from '../errors/index.js'

// ---------------------------------------------------------------------------
// Declaration Merging hook
//
// Plugin authors augment this interface to register their namespace types.
// The SDK class picks them up automatically via the `Plugins` generic.
//
// Usage (in the plugin package or the consumer's project):
//
//   declare module 'whitechain-sdk' {
//     interface WhitechainSDKPlugins {
//       marketplace: { buyNFT(tokenId: bigint): Promise<`0x${string}`> }
//     }
//   }
// ---------------------------------------------------------------------------

/**
 * Open interface for plugin namespace declaration merging.
 *
 * Third-party plugins augment this interface so the SDK instance is
 * strictly typed without any extra type assertions at the call site.
 *
 * @example
 * ```ts
 * // In your plugin package (or a .d.ts file in the consumer project):
 * declare module 'whitechain-sdk' {
 *   interface WhitechainSDKPlugins {
 *     marketplace: { buyNFT(tokenId: bigint): Promise<`0x${string}`> }
 *   }
 * }
 *
 * // Now sdk.marketplace.buyNFT(1n) is fully typed:
 * const sdk = await WhitechainSDK.create({ ... }, [marketplacePlugin])
 * await sdk.marketplace.buyNFT(1n)
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface WhitechainSDKPlugins {}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration passed to {@link WhitechainSDK.create} or the
 * {@link WhitechainSDK} constructor.
 *
 * Mirrors `WhiteChainConfig` but is independent so `WhitechainSDK` does not
 * have a hard coupling on the grant-specific client config.
 */
export interface WhitechainSDKConfig {
  /** The viem `Chain` the SDK should connect to. */
  chain?: Chain
  /** Pre-defined network profile (e.g. `networks.whitechainMainnet`). */
  network?: NetworkProfile
  /** The viem `Transport` to use. Defaults to `http()`. */
  transport?: Transport
  /** Signing account for write operations. Omit for a read-only SDK. */
  account?: Account | Address
  /**
   * Inject pre-constructed viem clients. Useful in tests or when sharing a
   * single connection pool across multiple SDK consumers.
   */
  clients?: {
    publicClient?: PublicClient
    walletClient?: WalletClient
  }
  /**
   * Custom logger. Defaults to a `console`-backed implementation.
   * Pass a no-op logger to silence all SDK output.
   */
  logger?: SDKLogger
}

// ---------------------------------------------------------------------------
// Internal console logger
// ---------------------------------------------------------------------------

const consoleLogger: SDKLogger = {
  info: (msg, ...args) => console.info(`[WhitechainSDK] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WhitechainSDK] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[WhitechainSDK] ${msg}`, ...args),
  debug: (msg, ...args) => console.debug(`[WhitechainSDK] ${msg}`, ...args),
}

// ---------------------------------------------------------------------------
// Reserved property names — plugins must not use these
// ---------------------------------------------------------------------------

const RESERVED_NAMES = new Set([
  'publicClient',
  'walletClient',
  'network',
  'logger',
  'use',
  'getPlugins',
])

// ---------------------------------------------------------------------------
// WhitechainSDK
// ---------------------------------------------------------------------------

/**
 * The extensible core of the WhiteChain SDK.
 *
 * `WhitechainSDK` is the entry-point for the plugin architecture. After
 * construction, every loaded plugin's namespace is available directly on the
 * instance and is fully typed through TypeScript declaration merging on
 * {@link WhitechainSDKPlugins}.
 *
 * **Core bundle size is completely unaffected by external plugins** — plugins
 * are code-split by design; the SDK only keeps a reference to whatever object
 * `onInitialize` returns.
 *
 * ---
 *
 * ### Async construction — use `WhitechainSDK.create()`
 *
 * `onInitialize` hooks may be async. Because constructors cannot be `async`,
 * use the static factory:
 *
 * ```ts
 * const sdk = await WhitechainSDK.create(
 *   { network: networks.whitechainMainnet },
 *   [marketplacePlugin, lendingPlugin],
 * )
 *
 * // sdk.marketplace and sdk.lending are live and typed
 * await sdk.marketplace.buyNFT(1n)
 * ```
 *
 * ### Sync-only usage
 *
 * When all plugins have synchronous `onInitialize` hooks you can use
 * `new WhitechainSDK(config, plugins)` directly — but prefer
 * `WhitechainSDK.create()` for forward compatibility.
 *
 * ---
 *
 * ### TypeScript augmentation
 *
 * ```ts
 * declare module 'whitechain-sdk' {
 *   interface WhitechainSDKPlugins {
 *     marketplace: { buyNFT(tokenId: bigint): Promise<`0x${string}`> }
 *   }
 * }
 * ```
 */
export class WhitechainSDK implements WhitechainSDKPlugins {
  // ----- public read-only fields -------------------------------------------

  /** The viem `PublicClient` for read-only contract calls. */
  public readonly publicClient: PublicClient

  /**
   * The viem `WalletClient` for write operations.
   * `undefined` when constructed without an `account` (read-only mode).
   */
  public readonly walletClient: WalletClient | undefined

  /** The resolved network profile, if one was provided. */
  public readonly network: NetworkProfile | undefined

  /** The active logger for this SDK instance. */
  public readonly logger: SDKLogger

  // ----- private state -----------------------------------------------------

  /** Loaded plugin metadata (name + version), in registration order. */
  private readonly _plugins: PluginMeta[] = []

  // ----- construction -------------------------------------------------------

  /**
   * Creates a `WhitechainSDK` instance and synchronously calls every plugin's
   * `onInitialize` hook.
   *
   * If any plugin's hook is async, the plugin namespace will be a `Promise`
   * on the instance — prefer {@link WhitechainSDK.create} to always get fully
   * resolved namespaces.
   *
   * @param config - SDK configuration.
   * @param plugins - Array of plugins to load. Each plugin's namespace is
   *   attached to the instance under `plugin.name`.
   */
  constructor(config: WhitechainSDKConfig = {}, plugins: ISDKPlugin[] = []) {
    this.logger = config.logger ?? consoleLogger
    this.network = config.network

    const transport =
      config.transport ??
      (config.network ? http(config.network.rpcUrl) : http())

    const chain = config.chain ?? config.network?.chain

    this.publicClient =
      (config.clients?.publicClient ??
      createPublicClient({ chain: chain as any, transport })) as PublicClient

    this.walletClient =
      (config.clients?.walletClient ??
      (config.account
        ? createWalletClient({ chain: chain as any, transport, account: config.account })
        : undefined)) as WalletClient | undefined

    // Build the immutable context exposed to plugins
    const ctx: SDKContext = {
      publicClient: this.publicClient,
      walletClient: this.walletClient,
      network: this.network,
      logger: this.logger,
    }

    // Load plugins
    for (const plugin of plugins) {
      this._registerPlugin(plugin, ctx)
    }
  }

  // ----- static factory (async-safe) ---------------------------------------

  /**
   * Async factory that fully awaits every plugin's `onInitialize` hook before
   * returning the SDK instance.
   *
   * This is the **recommended** way to construct a `WhitechainSDK` when any
   * plugin may perform async initialization (e.g. fetching on-chain config,
   * resolving ENS names, etc.).
   *
   * @param config - SDK configuration.
   * @param plugins - Array of plugins to load.
   * @returns A fully-initialized `WhitechainSDK` instance.
   *
   * @example
   * ```ts
   * const sdk = await WhitechainSDK.create(
   *   { network: networks.whitechainMainnet },
   *   [marketplacePlugin],
   * )
   * ```
   */
  static async create(
    config: WhitechainSDKConfig = {},
    plugins: ISDKPlugin[] = [],
  ): Promise<WhitechainSDK & WhitechainSDKPlugins> {
    const logger = config.logger ?? consoleLogger
    const network = config.network

    const transport =
      config.transport ??
      (network ? http(network.rpcUrl) : http())

    const chain = config.chain ?? network?.chain

    const publicClient =
      (config.clients?.publicClient ??
      createPublicClient({ chain: chain as any, transport })) as PublicClient

    const walletClient =
      (config.clients?.walletClient ??
      (config.account
        ? createWalletClient({ chain: chain as any, transport, account: config.account })
        : undefined)) as WalletClient | undefined

    const ctx: SDKContext = {
      publicClient,
      walletClient,
      network,
      logger,
    }

    // Pass pre-built clients so the constructor does not create duplicates
    const sdk = new WhitechainSDK(
      { ...config, clients: { publicClient, walletClient } },
      [],
    )

    // Await each plugin's onInitialize in registration order
    for (const plugin of plugins) {
      await sdk._registerPlugin(plugin, ctx)
    }

    return sdk as WhitechainSDK & WhitechainSDKPlugins
  }

  // ----- public API --------------------------------------------------------

  /**
   * Dynamically loads a single plugin after construction.
   *
   * Useful when a plugin needs to be loaded conditionally at runtime, or when
   * the plugin is supplied by the user after the SDK is first created.
   *
   * Returns `this` so calls can be chained (`.use(a).use(b)`). The returned
   * promise resolves once the plugin's `onInitialize` hook has completed.
   *
   * @param plugin - The plugin to load.
   * @returns `Promise<this>` for chaining.
   *
   * @example
   * ```ts
   * await sdk.use(marketplacePlugin)
   * await sdk.use(lendingPlugin)
   *
   * // or chained:
   * await (await sdk.use(marketplacePlugin)).use(lendingPlugin)
   * ```
   */
  async use(plugin: ISDKPlugin): Promise<this> {
    const ctx: SDKContext = {
      publicClient: this.publicClient,
      walletClient: this.walletClient,
      network: this.network,
      logger: this.logger,
    }
    await this._registerPlugin(plugin, ctx)
    return this
  }

  /**
   * Returns metadata for all currently loaded plugins, in registration order.
   *
   * @example
   * ```ts
   * console.log(sdk.getPlugins())
   * // [{ name: 'marketplace', version: '1.0.0' }, ...]
   * ```
   */
  getPlugins(): readonly PluginMeta[] {
    return [...this._plugins]
  }

  // ----- private helpers ---------------------------------------------------

  /**
   * Validates, calls `onInitialize`, and attaches a plugin's namespace.
   *
   * @internal
   */
  private async _registerPlugin(plugin: ISDKPlugin, ctx: SDKContext): Promise<void> {
    if (!plugin || typeof plugin !== 'object') {
      throw new ValidationError('Plugin must be a non-null object')
    }
    if (typeof plugin.name !== 'string' || plugin.name.trim() === '') {
      throw new ValidationError('Plugin must have a non-empty string `name`')
    }
    if (typeof plugin.version !== 'string' || plugin.version.trim() === '') {
      throw new ValidationError('Plugin must have a non-empty string `version`')
    }
    if (typeof plugin.onInitialize !== 'function') {
      throw new ValidationError(`Plugin "${plugin.name}" must implement onInitialize()`)
    }

    const name = plugin.name

    if (RESERVED_NAMES.has(name)) {
      throw new ValidationError(
        `Plugin name "${name}" is reserved. Choose a different name.`,
      )
    }

    if (name in this) {
      throw new ValidationError(
        `A plugin named "${name}" is already registered. Plugin names must be unique.`,
      )
    }

    this.logger.debug(`Loading plugin "${name}@${plugin.version}"`)

    let namespace: unknown
    try {
      namespace = await Promise.resolve(plugin.onInitialize(ctx))
    } catch (err) {
      throw new ValidationError(
        `Plugin "${name}" threw during onInitialize: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // Attach namespace to the SDK instance
    ;(this as Record<string, unknown>)[name] = namespace

    this._plugins.push({ name, version: plugin.version })

    this.logger.debug(`Plugin "${name}@${plugin.version}" loaded successfully`)
  }
}
