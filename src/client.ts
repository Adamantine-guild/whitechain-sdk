import { createPublicClient, createWalletClient, http, type Address, type Abi, type Hash } from 'viem'
import {
  WhiteChainConfig,
  ClientDeps,
  SubmitApplicationParams,
  ApproveApplicationParams,
  SubmitMilestoneEvidenceParams,
  ApproveMilestoneParams,
  ReleasePayoutParams,
  GrantRound,
  GrantApplication,
  Milestone,
} from './types.js'
import { WhiteChainError } from './types.js'

const ensure = <T>(value: T | undefined, message: string): T => {
  if (value === undefined || value === null) throw new WhiteChainError(message)
  return value
}

export type WhiteChainClient = ClientDeps & {
  addresses: { grant: Address }
  abis: { grant?: Abi }
  submitApplication(params: SubmitApplicationParams): Promise<Hash>
  approveApplication(params: ApproveApplicationParams): Promise<Hash>
  submitMilestoneEvidence(params: SubmitMilestoneEvidenceParams): Promise<Hash>
  approveMilestone(params: ApproveMilestoneParams): Promise<Hash>
  releasePayout(params: ReleasePayoutParams): Promise<Hash>
  getGrantRound(grantId: bigint): Promise<GrantRound>
  getGrantApplication(applicationId: bigint): Promise<GrantApplication>
  getMilestones(applicationId: bigint): Promise<Milestone[]>
}

const defaultTransport = http()

export function createWhiteChainClient(config: WhiteChainConfig): WhiteChainClient {
  const transport = config.transport ?? defaultTransport
  const publicClient =
    config.clients?.publicClient ??
    createPublicClient({ chain: config.chain as any, transport })
  const walletClient =
    config.clients?.walletClient ??
    (config.account
      ? createWalletClient({ chain: config.chain as any, transport, account: config.account })
      : undefined)

  const addresses = config.addresses
  const abis = config.abis ?? {}

  const requireWallet = () => ensure(walletClient, 'Wallet client is required for write actions')
  const requireGrantAbi = () => ensure(abis.grant, 'Grant contract ABI must be provided in config.abis.grant')

  return {
    publicClient,
    walletClient,
    addresses,
    abis,

    async submitApplication({ grantId, applicant, metadataUri }) {
      const wc = requireWallet()
      const abi = requireGrantAbi()
      return wc.writeContract({
        address: addresses.grant,
        abi,
        functionName: 'submitApplication',
        args: [grantId, applicant, metadataUri],
      })
    },

    async approveApplication({ applicationId }) {
      const wc = requireWallet()
      const abi = requireGrantAbi()
      return wc.writeContract({
        address: addresses.grant,
        abi,
        functionName: 'approveApplication',
        args: [applicationId],
      })
    },

    async submitMilestoneEvidence({ milestoneId, evidenceUri }) {
      const wc = requireWallet()
      const abi = requireGrantAbi()
      return wc.writeContract({
        address: addresses.grant,
        abi,
        functionName: 'submitMilestoneEvidence',
        args: [milestoneId, evidenceUri],
      })
    },

    async approveMilestone({ milestoneId }) {
      const wc = requireWallet()
      const abi = requireGrantAbi()
      return wc.writeContract({
        address: addresses.grant,
        abi,
        functionName: 'approveMilestone',
        args: [milestoneId],
      })
    },

    async releasePayout({ milestoneId }) {
      const wc = requireWallet()
      const abi = requireGrantAbi()
      return wc.writeContract({
        address: addresses.grant,
        abi,
        functionName: 'releasePayout',
        args: [milestoneId],
      })
    },

    async getGrantRound(grantId) {
      const abi = requireGrantAbi()
      const [status, applicationsCount] = await publicClient.readContract({
        address: addresses.grant,
        abi,
        functionName: 'getGrantRound',
        args: [grantId],
      }) as readonly [number, bigint]
      const statusMap: Record<number, GrantRound['status']> = { 0: 'open', 1: 'closed', 2: 'archived' }
      return { id: grantId, status: statusMap[status] ?? 'open', applicationsCount }
    },

    async getGrantApplication(applicationId) {
      const abi = requireGrantAbi()
      const [applicant, status, metadataUri] = await publicClient.readContract({
        address: addresses.grant,
        abi,
        functionName: 'getGrantApplication',
        args: [applicationId],
      }) as readonly [Address, number, string]
      const statusMap: Record<number, 'submitted' | 'approved' | 'rejected'> = {
        0: 'submitted',
        1: 'approved',
        2: 'rejected',
      }
      return { id: applicationId, applicant, status: statusMap[status] ?? 'submitted', metadataUri }
    },

    async getMilestones(applicationId) {
      const abi = requireGrantAbi()
      const raw = await publicClient.readContract({
        address: addresses.grant,
        abi,
        functionName: 'getMilestones',
        args: [applicationId],
      }) as readonly Array<readonly [bigint, number, string]>

      const statusMap: Record<number, Milestone['status']> = {
        0: 'pending',
        1: 'evidence-submitted',
        2: 'approved',
        3: 'paid',
      }

      return raw.map(([id, status, evidenceUri]) => ({
        id,
        status: statusMap[status] ?? 'pending',
        evidenceUri: evidenceUri || undefined,
      }))
    },
  }
}
