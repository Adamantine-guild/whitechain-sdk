export {
  createWhiteChainClient,
  type WhiteChainClient,
} from './client.js'
export { formatUnits, parseUnits } from './utils/math.js'

export {
  HistoricalSync,
  getLogsChunked,
  type HistoricalSyncOptions,
  type ProgressInfo,
  type RawLog,
  type LogFilter,
} from './services/HistoricalSync.js'
export * from './constants.js'
export * from './config/networks.js'
export * from './network/provider.js'
export * from './network/BatchProvider.js'

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

export { WhiteChainError, TODO } from './types.js'

export {
  Eip1193Provider,
  BrowserProvider,
  createBrowserClient,
  type EIP1193Provider,
} from './providers/BrowserProvider.js'

export {
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
