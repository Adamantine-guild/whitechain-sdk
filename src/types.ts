import type { Abi, Address, Chain, Transport, PublicClient, WalletClient, Account } from 'viem'
import type { EIP1193Provider, Eip1193Provider } from './providers/BrowserProvider.js'

export type WhiteChainAddresses = {
  grant: Address
}

export type WhiteChainAbis = {
  grant?: Abi
}

export type WhiteChainConfig = {
  chain: Chain
  transport?: Transport
  provider?: EIP1193Provider | Eip1193Provider
  addresses: WhiteChainAddresses
  abis?: WhiteChainAbis
  account?: Account | Address
  clients?: Partial<ClientDeps>
}

export type ClientDeps = {
  publicClient: PublicClient
  walletClient?: WalletClient
}

export type ApplicationId = bigint
export type MilestoneId = bigint
export type GrantId = bigint

export type SubmitApplicationParams = {
  grantId: GrantId
  applicant: Address
  metadataUri: string
}

export type ApproveApplicationParams = {
  applicationId: ApplicationId
}

export type SubmitMilestoneEvidenceParams = {
  milestoneId: MilestoneId
  evidenceUri: string
}

export type ApproveMilestoneParams = {
  milestoneId: MilestoneId
}

export type ReleasePayoutParams = {
  milestoneId: MilestoneId
}

export type GrantRound = {
  id: GrantId
  status: 'open' | 'closed' | 'archived'
  applicationsCount: bigint
}

export type GrantApplication = {
  id: ApplicationId
  applicant: Address
  status: 'submitted' | 'approved' | 'rejected'
  metadataUri: string
}

export type Milestone = {
  id: MilestoneId
  status: 'pending' | 'evidence-submitted' | 'approved' | 'paid'
  evidenceUri?: string
}

export type MinimalReadResult<T> = Promise<T>

export class WhiteChainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WhiteChainError'
  }
}

export const TODO = {
  voting: 'TODO: voting support',
  delegation: 'TODO: delegation support',
  analytics: 'TODO: analytics queries',
  reputation: 'TODO: reputation integration',
} as const
