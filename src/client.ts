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
import { WhiteChainError, ValidationError } from './errors/index.js'
import type { NetworkProfile } from './config/networks.js'
import { Eip1193Provider } from './providers/BrowserProvider.js'

const ensure = <T>(value: T | undefined, message: string): T => {
  if (value === undefined || value === null) throw new ValidationError(message)
  return value
}

/**
 * A configured client for reading and writing to WhiteChain's grant round
 * contract. Construct one with {@link createWhiteChainClient}.
 */
export type WhiteChainClient = ClientDeps & {
  /** Contract addresses this client was configured with. */
  addresses: { grant: Address }
  /** Contract ABIs this client was configured with. */
  abis: { grant?: Abi }
  /** Optional network profile associated with this client instance. */
  network?: NetworkProfile
  /** Standard block explorer URL associated with this client instance. */
  blockExplorerUrl?: string

  /**
   * Submits a new grant application on behalf of `applicant`.
   * @throws {WhiteChainError} if the client has no signing account, or no `abis.grant` was provided.
   * @returns The transaction hash.
   */
  submitApplication(params: SubmitApplicationParams): Promise<Hash>

  /**
   * Approves a pending grant application.
   * @throws {WhiteChainError} if the client has no signing account, or no `abis.grant` was provided.
   * @returns The transaction hash.
   */
  approveApplication(params: ApproveApplicationParams): Promise<Hash>

  /**
   * Submits evidence for a milestone.
   * @throws {WhiteChainError} if the client has no signing account, or no `abis.grant` was provided.
   * @returns The transaction hash.
   */
  submitMilestoneEvidence(params: SubmitMilestoneEvidenceParams): Promise<Hash>

  /**
   * Approves previously submitted milestone evidence.
   * @throws {WhiteChainError} if the client has no signing account, or no `abis.grant` was provided.
   * @returns The transaction hash.
   */
  approveMilestone(params: ApproveMilestoneParams): Promise<Hash>

  /**
   * Releases the payout for an approved milestone to its grantee.
   * @throws {WhiteChainError} if the client has no signing account, or no `abis.grant` was provided.
   * @returns The transaction hash.
   */
  releasePayout(params: ReleasePayoutParams): Promise<Hash>

  /**
   * Reads a grant round's current status and application count.
   * @throws {WhiteChainError} if no `abis.grant` was provided.
   */
  getGrantRound(grantId: bigint): Promise<GrantRound>

  /**
   * Reads a grant application's current state.
   * @throws {WhiteChainError} if no `abis.grant` was provided.
   */
  getGrantApplication(applicationId: bigint): Promise<GrantApplication>

  /**
   * Reads all milestones defined for a grant application.
   * @throws {WhiteChainError} if no `abis.grant` was provided.
   */
  getMilestones(applicationId: bigint): Promise<Milestone[]>
}

const defaultTransport = http()

/**
 * Builds a {@link WhiteChainClient} for reading and writing to WhiteChain's
 * grant round contract.
 *
 * Pass an `account` in `config` to enable write methods (submitting
 * applications, approving, releasing payouts); omit it to get a read-only
 * client — calling a write method on it throws a {@link WhiteChainError}.
 *
 * @example
 * ```ts
 * const client = createWhiteChainClient({
 *   network: networks.sepolia,
 *   addresses: { grant: '0x...' },
 *   abis: { grant: grantAbi },
 * })
 * const round = await client.getGrantRound(1n)
 * ```
 */
export function createWhiteChainClient(config: WhiteChainConfig & { provider?: any }): WhiteChainClient {
  const network = config.network
  const blockExplorerUrl = config.blockExplorerUrl ?? network?.blockExplorerUrl
  const transport =
    config.transport ??
    (network
      ? http(network.rpcUrl)
      : config.provider
      ? (config.provider instanceof Eip1193Provider
          ? config.provider
          : new Eip1193Provider(config.provider)
        ).toTransport()
      : defaultTransport)
  const chain = config.chain ?? network?.chain

  const publicClient =
    config.clients?.publicClient ??
    createPublicClient({ chain: chain as any, transport })
  const walletClient =
    config.clients?.walletClient ??
    (config.account
      ? createWalletClient({ chain: chain as any, transport, account: config.account })
      : undefined)

  const addresses = config.addresses
  const abis = config.abis ?? {}

  const requireWallet = () => ensure(walletClient, 'Wallet client is required for write actions')
  const requireGrantAbi = () => ensure(abis.grant, 'Grant contract ABI must be provided in config.abis.grant')

  return {
    publicClient: publicClient as any,
    walletClient: walletClient as any,
    addresses,
    abis,
    network,
    blockExplorerUrl,

    async submitApplication({ grantId, applicant, metadataUri }) {
      const wc = requireWallet()
      const abi = requireGrantAbi()
      return (wc as any).writeContract({
        address: addresses.grant,
        abi,
        functionName: 'submitApplication',
        args: [grantId, applicant, metadataUri],
      } as any)
    },

    async approveApplication({ applicationId }) {
      const wc = requireWallet()
      const abi = requireGrantAbi()
      return (wc as any).writeContract({
        address: addresses.grant,
        abi,
        functionName: 'approveApplication',
        args: [applicationId],
      } as any)
    },

    async submitMilestoneEvidence({ milestoneId, evidenceUri }) {
      const wc = requireWallet()
      const abi = requireGrantAbi()
      return (wc as any).writeContract({
        address: addresses.grant,
        abi,
        functionName: 'submitMilestoneEvidence',
        args: [milestoneId, evidenceUri],
      } as any)
    },

    async approveMilestone({ milestoneId }) {
      const wc = requireWallet()
      const abi = requireGrantAbi()
      return (wc as any).writeContract({
        address: addresses.grant,
        abi,
        functionName: 'approveMilestone',
        args: [milestoneId],
      } as any)
    },

    async releasePayout({ milestoneId }) {
      const wc = requireWallet()
      const abi = requireGrantAbi()
      return (wc as any).writeContract({
        address: addresses.grant,
        abi,
        functionName: 'releasePayout',
        args: [milestoneId],
      } as any)
    },

    async getGrantRound(grantId) {
      const abi = requireGrantAbi()
      const [status, applicationsCount] = await (publicClient as any).readContract({
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
      const [applicant, status, metadataUri] = await (publicClient as any).readContract({
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
      const raw = await (publicClient as any).readContract({
        address: addresses.grant,
        abi,
        functionName: 'getMilestones',
        args: [applicationId],
      }) as unknown as Array<readonly [bigint, number, string]>

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
