import type { Abi, Address, Chain, Transport, PublicClient, WalletClient, Account } from 'viem'
import type { EIP1193Provider, Eip1193Provider } from './providers/BrowserProvider.js'

/** Contract addresses the client needs to know about. */
export type WhiteChainAddresses = {
  /** Address of the deployed grant round contract. */
  grant: Address
}

/** ABIs used to encode/decode calls to WhiteChain contracts. */
export type WhiteChainAbis = {
  /**
   * ABI for the grant round contract. Required for any grant read/write
   * method on {@link WhiteChainClient} — omitting it throws a
   * {@link WhiteChainError} the first time such a method is called.
   */
  grant?: Abi
}

/**
 * Configuration passed to {@link createWhiteChainClient}.
 *
 * @example
 * ```ts
 * const client = createWhiteChainClient({
 *   chain: mainnet,
 *   transport: http(),
 *   addresses: { grant: '0x...' },
 *   abis: { grant: grantAbi },
 *   account: myAccount, // omit for a read-only client
 * })
 * ```
 */
export type WhiteChainConfig = {
  /** The viem `Chain` the client talks to. */
  chain: Chain
  transport?: Transport
  provider?: EIP1193Provider | Eip1193Provider
  /** The viem `Transport` (e.g. `http()`) used for both clients. */
  transport: Transport
  /** Contract addresses referenced by client methods. */
  addresses: WhiteChainAddresses
  /** Contract ABIs referenced by client methods. */
  abis?: WhiteChainAbis
  account?: Account | Address
  /**
   * The signing account for write methods (`submitApplication`,
   * `approveApplication`, etc.). Leave unset to construct a read-only
   * client — write methods will throw a {@link WhiteChainError} if called.
   */
  account?: Account
  /**
   * Pre-built viem clients to reuse instead of constructing new ones from
   * `chain`/`transport`/`account`. Useful for sharing a client instance
   * (and its connection pool) across multiple SDK consumers.
   */
  clients?: Partial<ClientDeps>
}

/** The underlying viem clients a {@link WhiteChainClient} is built on. */
export type ClientDeps = {
  /** Used for all read-only contract calls. */
  publicClient: PublicClient
  /** Used for all write (transaction-sending) contract calls, if provided. */
  walletClient?: WalletClient
}

/** On-chain identifier of a grant application. */
export type ApplicationId = bigint
/** On-chain identifier of a milestone. */
export type MilestoneId = bigint
/** On-chain identifier of a grant round. */
export type GrantId = bigint

/** Parameters for {@link WhiteChainClient}.`submitApplication`. */
export type SubmitApplicationParams = {
  /** The grant round being applied to. */
  grantId: GrantId
  /** Address of the applicant submitting the application. */
  applicant: Address
  /** URI (e.g. IPFS) pointing at the application's off-chain metadata. */
  metadataUri: string
}

/** Parameters for {@link WhiteChainClient}.`approveApplication`. */
export type ApproveApplicationParams = {
  /** The application being approved. */
  applicationId: ApplicationId
}

/** Parameters for {@link WhiteChainClient}.`submitMilestoneEvidence`. */
export type SubmitMilestoneEvidenceParams = {
  /** The milestone the evidence is being submitted for. */
  milestoneId: MilestoneId
  /** URI (e.g. IPFS) pointing at the submitted evidence. */
  evidenceUri: string
}

/** Parameters for {@link WhiteChainClient}.`approveMilestone`. */
export type ApproveMilestoneParams = {
  /** The milestone being approved. */
  milestoneId: MilestoneId
}

/** Parameters for {@link WhiteChainClient}.`releasePayout`. */
export type ReleasePayoutParams = {
  /** The milestone whose payout is being released. */
  milestoneId: MilestoneId
}

/** On-chain state of a grant round, as returned by {@link WhiteChainClient}.`getGrantRound`. */
export type GrantRound = {
  /** The grant round's identifier (echoed back from the request). */
  id: GrantId
  /** Current lifecycle state of the round. */
  status: 'open' | 'closed' | 'archived'
  /** Number of applications submitted to this round. */
  applicationsCount: bigint
}

/** On-chain state of a grant application, as returned by {@link WhiteChainClient}.`getGrantApplication`. */
export type GrantApplication = {
  /** The application's identifier (echoed back from the request). */
  id: ApplicationId
  /** Address that submitted the application. */
  applicant: Address
  /** Current review state of the application. */
  status: 'submitted' | 'approved' | 'rejected'
  /** URI (e.g. IPFS) pointing at the application's off-chain metadata. */
  metadataUri: string
}

/** On-chain state of a milestone, as returned by {@link WhiteChainClient}.`getMilestones`. */
export type Milestone = {
  /** The milestone's identifier. */
  id: MilestoneId
  /** Current lifecycle state of the milestone. */
  status: 'pending' | 'evidence-submitted' | 'approved' | 'paid'
  /** URI of the submitted evidence, if any has been submitted yet. */
  evidenceUri?: string
}

/** A promise resolving to a read result `T`. Documents intent at call sites. */
export type MinimalReadResult<T> = Promise<T>

/**
 * Error thrown by {@link WhiteChainClient} methods for SDK-level failures —
 * e.g. calling a write method on a read-only client, or calling a grant
 * method without providing `abis.grant` in {@link WhiteChainConfig}.
 *
 * Contract reverts and network/transport errors surface as their own
 * (viem-thrown) error types, not this one.
 */
export class WhiteChainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WhiteChainError'
  }
}

/**
 * Placeholder messages for features this SDK does not implement yet.
 * Not thrown or used at runtime — for consumers scanning the public API to
 * see what's planned.
 */
export const TODO = {
  voting: 'TODO: voting support',
  delegation: 'TODO: delegation support',
  analytics: 'TODO: analytics queries',
  reputation: 'TODO: reputation integration',
} as const
