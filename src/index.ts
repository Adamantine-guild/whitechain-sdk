export {
  createWhiteChainClient,
  type WhiteChainClient,
} from './client.js'
export { formatUnits, parseUnits } from './utils/math.js'
export { formatBigIntToString, type BigIntToString } from './utils/formatters.js'
export {
  signERC20Permit,
  splitSignature,
  EIP2612_PERMIT_TYPES,
  type SignERC20PermitOptions,
  type ERC20PermitSignature,
  type EIP2612Domain,
  type PermitTypes,
} from './utils/permit.js'

export {
  buildPermitPayload,
  hashPermitPayload,
  verifySignature,
  recoverPermitSigner,
  parseEip712Signature,
  WHITECHAIN_EIP712,
  SECP256K1_HALF_ORDER,
  type SignatureInput,
  type PermitDomainOptions,
  type PermitMessage,
  type EIP712PermitPayload,
} from './utils/signatures.js'

export {
  validateStakingInput,
  type StakingValidationOptions,
  type ValidationResult,
} from './utils/validation.js'
export {
  StakingForm,
  handleStakingInputChange,
  type StakingFormProps,
  type FormattedStakingState,
} from './components/staking/StakingForm.js'

export {
  HistoricalSync,
  getLogsChunked,
  type HistoricalSyncOptions,
  type ProgressInfo,
  type RawLog,
  type LogFilter,
} from './services/HistoricalSync.js'

export { toChecksumAddress, isAddress, assertChecksumAddress } from './utils/address.js'
export * from './constants.js'
export * from './config/networks.js'
export * from './network/provider.js'
export * from './network/BatchProvider.js'
export {
  WsProvider,
  createWsProvider,
  computeReconnectDelay,
  type WsProviderOptions,
  type WsProviderEvent,
  type WsReadyState,
  type WebSocketLike,
  type ActiveSubscription,
} from './network/ws-provider.js'
export {
  withRetry,
  computeBackoffDelay,
  isRetryableError,
  isRetryableHttpStatus,
  RetryExhaustedError,
  type RetryOptions,
  type RetryAttemptInfo,
} from './utils/retry.js'
export { Contract } from './core/Contract.js'
export * from './core/TransactionHelper.js'
export { NetworkContext, type NetworkObserver, type NetworkState } from './core/NetworkContext.js'
export { AbiCache, abiCache } from './core/AbiCache.js'

// ---------------------------------------------------------------------------
// In-memory LRU cache + token metadata service (#118)
// ---------------------------------------------------------------------------
export { LRUCache, createLRUCache, type LRUCacheOptions, type LRUCacheStats } from './cache/LRUCache.js'
export { LRUMemoryCache, type LRUMemoryCacheOptions } from './cache/adapters/LRUMemoryCache.js'
export {
  CacheManager,
  defaultCacheManager,
  type CacheOptions,
  type CacheKeyParams,
} from './cache/CacheManager.js'
export { MemoryCache } from './cache/adapters/MemoryCache.js'
export type { CacheAdapter, CacheEntry } from './cache/adapters/CacheAdapter.js'
export {
  TokenService,
  createTokenService,
  clearSdkCache,
  ERC20_METADATA_ABI,
  type TokenServiceOptions,
  type TokenMetadata,
  type TokenReadClient,
} from './services/TokenService.js'

export type {
  WhiteChainConfig,
  WhiteChainAddresses,
  WhiteChainAbis,
  ClientDeps,
  ApplicationId,
  MilestoneId,
  GrantId,
  SubmitApplicationParams,
  ApproveApplicationParams,
  SubmitMilestoneEvidenceParams,
  ApproveMilestoneParams,
  ReleasePayoutParams,
  GrantRound,
  GrantApplication,
  Milestone,
} from './types.js'

export { TODO } from './types.js'
export * from './errors/index.js'
export * from './storage/index.js'
export * from './zk/index.js'
export * from './errors/WhitechainErrors.js'
export { parseContractError } from './utils/errorHandler.js'
export {
  decodeError,
  extractRevertReason,
  isUserRejection,
  ensureSdkError,
} from './utils/errorDecoder.js'
export * from './storage/index.js'

export {
  Eip1193Provider,
  BrowserProvider,
  createBrowserClient,
  type EIP1193Provider,
} from './providers/BrowserProvider.js'

export {
  NonceManager,
  createNonceManager,
  type NonceManagerOptions,
  type GetOnChainNonceFn,
} from './wallet/index.js'

export {
  IpcProvider,
  type IpcProviderOptions,
} from './providers/IpcProvider.js'

export {
  MockProvider,
  returns,
} from './testing/MockProvider.js'
export {
  RpcProvider,
  createRpcProvider,
  type RpcProviderOptions,
} from './providers/RpcProvider.js'

export type { RpcProviderConfig } from './types/config.js'

export {
  Contract,
  type ContractClient,
} from './core/index.js'
export { HDWallet, createHDWallet, type HDWalletOptions } from './wallet/HDWallet.js'
export { Contract, type ContractClient } from './core/Contract.js'
export { HDWallet, createHDWallet, type HDWalletOptions } from './wallet/HDWallet.js'
export {
  Multicall,
  createMulticall,
  DEFAULT_MULTICALL3_ADDRESS,
  encodeAggregate3,
  decodeAggregate3Results,
} from './core/Multicall.js'
export type {
  Multicall3Call,
  Multicall3CallResult,
  Multicall3Options,
} from './types/multicall.js'
export {
  ContractWrapper,
  type ContractWrapperOptions,
  type ReadCallOptions,
} from './core/ContractWrapper.js'
export {
  SubgraphClient,
  createSubgraphClient,
  type SubgraphClientOptions,
  type Trader,
  type Trade,
  type VaultSnapshot,
  type SubgraphSyncStatus,
  type GetTopTradersOptions,
  type GetTradesOptions,
} from './subgraph/index.js'

export {
  MockProvider,
  returns,
} from './testing/MockProvider.js'

export {
  sign,
  verify,
  recoverPublicKey,
  getPublicKey,
  getActiveBackendName,
  type Signature,
  type SignerBackend,
} from './crypto/index.js'

// ---------------------------------------------------------------------------
// Cross-chain state proof verifier (EIP-1186 account/storage proofs)
// ---------------------------------------------------------------------------

export {
  verifyAccountProof,
  verifyStorageProof,
  verifyEIP1186Proof,
  isValidStateProof,
  EMPTY_TRIE_ROOT,
  EMPTY_CODE_HASH,
  type AccountProofInput,
  type StorageProofInput,
  type ProofVerificationResult,
  type EIP1186VerificationResult,
} from './crypto/StateProver.js'

export { Simulator } from './services/Simulator.js'
export type { SimulationResult, SimulationOptions, TransferEvent, StateOverrides } from './types/simulation.js'
export {
  MulticallService,
  MULTICALL3_ADDRESS,
  MULTICALL3_ADDRESSES,
  getMulticall3Address,
  multicall3Abi,
  type MulticallRequest,
  type MulticallResult,
  type MulticallResults,
  type MulticallSuccess,
  type MulticallFailure,
  type MulticallServiceOptions,
  type MulticallExecuteOptions,
} from './services/MulticallService.js'
// ---------------------------------------------------------------------------
// Plugin system
// ---------------------------------------------------------------------------

export {
  WhitechainSDK,
  type WhitechainSDKConfig,
  type WhitechainSDKPlugins,
} from './core/WhitechainSDK.js'

export type {
  ISDKPlugin,
  SDKContext,
  SDKLogger,
  PluginMeta,
} from './interfaces/ISDKPlugin.js'

// ---------------------------------------------------------------------------
// Offline / air-gapped transaction signing (cold storage)
// ---------------------------------------------------------------------------

export {
  OfflineSigner,
  signOfflineTransaction,
  type OfflineTransaction,
  type OfflineLegacyTransaction,
  type OfflineEip1559Transaction,
  type SignedOfflineTransaction,
} from './security/index.js'
