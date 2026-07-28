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
