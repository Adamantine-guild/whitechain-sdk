import type { PublicClient, WalletClient } from 'viem'
import type { NetworkProfile } from '../config/networks.js'

/**
 * The context object passed to every plugin's {@link ISDKPlugin.onInitialize}
 * hook. Exposes the SDK internals that plugins are allowed to read from.
 *
 * This is the *only* surface plugins should access — do **not** reach into
 * the `WhitechainSDK` instance directly.
 */
export interface SDKContext {
  /** The viem `PublicClient` used for all read-only contract calls. */
  readonly publicClient: PublicClient

  /**
   * The viem `WalletClient` used for signing and sending transactions.
   * `undefined` when the SDK was constructed without an `account` (read-only
   * mode).
   */
  readonly walletClient: WalletClient | undefined

  /**
   * The resolved network profile for this SDK instance, or `undefined` if the
   * SDK was constructed without one.
   */
  readonly network: NetworkProfile | undefined

  /**
   * A simple structured logger. Plugins should use this instead of
   * `console.*` so their output participates in the SDK's logging system.
   */
  readonly logger: SDKLogger
}

/**
 * Minimal structured logger exposed to plugins.
 *
 * Implementations may forward messages to `console`, a file, a remote
 * aggregator, or a no-op sink — plugins must not care which.
 */
export interface SDKLogger {
  /** Log an informational message. */
  info(message: string, ...args: unknown[]): void
  /** Log a warning. */
  warn(message: string, ...args: unknown[]): void
  /** Log an error. */
  error(message: string, ...args: unknown[]): void
  /** Log a debug-level message (only emitted in verbose/debug mode). */
  debug(message: string, ...args: unknown[]): void
}

/**
 * Contract that every WhiteChain SDK plugin must satisfy.
 *
 * A plugin is a plain object (or class instance) with:
 * - a unique {@link name} used as the namespace key on the SDK instance,
 * - a human-readable {@link version} string,
 * - an {@link onInitialize} hook called once during SDK construction.
 *
 * @example Defining a plugin
 * ```ts
 * import type { ISDKPlugin, SDKContext } from 'whitechain-sdk'
 *
 * export const myPlugin: ISDKPlugin = {
 *   name: 'marketplace',
 *   version: '1.0.0',
 *   onInitialize(ctx: SDKContext) {
 *     return {
 *       buyNFT: async (tokenId: bigint) => {
 *         ctx.logger.info(`Buying NFT ${tokenId}`)
 *         // … call contracts via ctx.publicClient / ctx.walletClient
 *       },
 *     }
 *   },
 * }
 * ```
 *
 * @example Type-safe namespace augmentation
 * ```ts
 * declare module 'whitechain-sdk' {
 *   interface WhitechainSDKPlugins {
 *     marketplace: ReturnType<typeof myPlugin.onInitialize>
 *   }
 * }
 * ```
 */
export interface ISDKPlugin<TNamespace = unknown> {
  /**
   * Unique identifier for this plugin.
   *
   * This string becomes the property key on the SDK instance, so it must be a
   * valid JavaScript identifier and must not collide with any built-in SDK
   * property (e.g. `publicClient`, `network`, `use`).
   */
  readonly name: string

  /**
   * Semver-style version string, e.g. `"1.0.0"`.
   *
   * The SDK does **not** enforce versioning rules — this field is informational
   * and surfaced on the registered plugin metadata returned by
   * {@link WhitechainSDK.getPlugins}.
   */
  readonly version: string

  /**
   * Lifecycle hook called once during {@link WhitechainSDK} construction, after
   * all core internals have been set up.
   *
   * The hook receives a read-only {@link SDKContext} and must return the
   * namespace object that will be attached to the SDK instance under
   * `sdk[plugin.name]`.
   *
   * The hook may be `async` — the SDK awaits it before marking initialization
   * complete.
   *
   * @param ctx - Immutable view of the SDK's internal state.
   * @returns The namespace object (or a Promise that resolves to it).
   */
  onInitialize(ctx: SDKContext): TNamespace | Promise<TNamespace>
}

/**
 * Metadata record stored for each loaded plugin. Returned by
 * {@link WhitechainSDK.getPlugins}.
 */
export interface PluginMeta {
  /** The plugin's {@link ISDKPlugin.name}. */
  readonly name: string
  /** The plugin's {@link ISDKPlugin.version}. */
  readonly version: string
}
