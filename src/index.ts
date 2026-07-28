export {
  createWhiteChainClient,
  type WhiteChainClient,
} from './client.js'
export { formatUnits, parseUnits } from './utils/math.js'
export { toChecksumAddress, isAddress, assertChecksumAddress } from './utils/address.js'
export * from './constants.js'
export * from './config/networks.js'
export * from './network/provider.js'
export * from './network/BatchProvider.js'
export { Contract } from './core/Contract.js'
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
