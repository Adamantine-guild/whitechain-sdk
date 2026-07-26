import { type Address, type Abi, type Hash } from 'viem';
import type { GrantChainConfig, ClientDeps, SubmitApplicationParams, ApproveApplicationParams, SubmitMilestoneEvidenceParams, ApproveMilestoneParams, ReleasePayoutParams, GrantRound, GrantApplication, Milestone } from './types';
export type GrantChainClient = ClientDeps & {
    addresses: {
        grant: Address;
    };
    abis: {
        grant?: Abi;
    };
    submitApplication(params: SubmitApplicationParams): Promise<Hash>;
    approveApplication(params: ApproveApplicationParams): Promise<Hash>;
    submitMilestoneEvidence(params: SubmitMilestoneEvidenceParams): Promise<Hash>;
    approveMilestone(params: ApproveMilestoneParams): Promise<Hash>;
    releasePayout(params: ReleasePayoutParams): Promise<Hash>;
    getGrantRound(grantId: bigint): Promise<GrantRound>;
    getGrantApplication(applicationId: bigint): Promise<GrantApplication>;
    getMilestones(applicationId: bigint): Promise<Milestone[]>;
};
export declare function createGrantChainClient(config: GrantChainConfig): GrantChainClient;
