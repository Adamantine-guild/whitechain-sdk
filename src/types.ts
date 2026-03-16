import type { Abi, Address, Chain, Transport, PublicClient, WalletClient, Account } from 'viem'

export type GrantChainAddresses = {
  grant: Address
}

export type GrantChainAbis = {
  grant?: Abi
}

export type GrantChainConfig = {
  chain: Chain
  transport: Transport
  addresses: GrantChainAddresses
  abis?: GrantChainAbis
  account?: Account
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

export class GrantChainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GrantChainError'
  }
}

export const TODO = {
  voting: 'TODO: voting support',
  delegation: 'TODO: delegation support',
  analytics: 'TODO: analytics queries',
  reputation: 'TODO: reputation integration',
} as const
