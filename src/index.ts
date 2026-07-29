export {
  createWhiteChainClient,
  type WhiteChainClient,
} from './client.js'
export { formatUnits, parseUnits } from './utils/math.js'

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
export * from './core/TransactionHelper.js'
export { NetworkContext, type NetworkObserver, type NetworkState } from './core/NetworkContext.js'
export { AbiCache, abiCache } from './core/AbiCache.js'

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
export * from './errors/WhitechainErrors.js'
export { parseContractError } from './utils/errorHandler.js'
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


  IpcProvider,
  type IpcProviderOptions,
} from './providers/IpcProvider.js'

export {
  RpcProvider,
  createRpcProvider,
  type RpcProviderOptions,
} from './providers/RpcProvider.js'

export type { RpcProviderConfig } from './types/config.js'

export { Contract, type ContractClient } from './core/Contract.js'
export { HDWallet, createHDWallet, type HDWalletOptions } from './wallet/HDWallet.js'
export {
  Contract,
  type ContractClient,
  ContractWrapper,
  type ContractWrapperOptions,
  type ReadCallOptions,
} from './core/index.js'
export { HDWallet, createHDWallet, type HDWalletOptions } from './wallet/HDWallet.js'
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
export { Contract, type ContractClient } from './core/Contract.js'
export { HDWallet, createHDWallet, type HDWalletOptions } from './wallet/HDWallet.js'
export { Contract, type ContractClient } from './core/Contract.js'

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

export { Simulator } from './services/Simulator.js'
export type { SimulationResult, SimulationOptions, TransferEvent, StateOverrides } from './types/simulation.js'
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
