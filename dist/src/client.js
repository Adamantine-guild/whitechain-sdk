import { createPublicClient, createWalletClient, http } from 'viem';
import { GrantChainError } from './types';
const ensure = (value, message) => {
    if (value === undefined || value === null)
        throw new GrantChainError(message);
    return value;
};
const defaultTransport = http();
export function createGrantChainClient(config) {
    const transport = config.transport ?? defaultTransport;
    const publicClient = config.clients?.publicClient ??
        createPublicClient({ chain: config.chain, transport });
    const walletClient = config.clients?.walletClient ??
        (config.account
            ? createWalletClient({ chain: config.chain, transport, account: config.account })
            : undefined);
    const addresses = config.addresses;
    const abis = config.abis ?? {};
    const requireWallet = () => ensure(walletClient, 'Wallet client is required for write actions');
    const requireGrantAbi = () => ensure(abis.grant, 'Grant contract ABI must be provided in config.abis.grant');
    return {
        publicClient,
        walletClient,
        addresses,
        abis,
        async submitApplication({ grantId, applicant, metadataUri }) {
            const wc = requireWallet();
            const abi = requireGrantAbi();
            return wc.writeContract({
                address: addresses.grant,
                abi,
                functionName: 'submitApplication',
                args: [grantId, applicant, metadataUri],
            });
        },
        async approveApplication({ applicationId }) {
            const wc = requireWallet();
            const abi = requireGrantAbi();
            return wc.writeContract({
                address: addresses.grant,
                abi,
                functionName: 'approveApplication',
                args: [applicationId],
            });
        },
        async submitMilestoneEvidence({ milestoneId, evidenceUri }) {
            const wc = requireWallet();
            const abi = requireGrantAbi();
            return wc.writeContract({
                address: addresses.grant,
                abi,
                functionName: 'submitMilestoneEvidence',
                args: [milestoneId, evidenceUri],
            });
        },
        async approveMilestone({ milestoneId }) {
            const wc = requireWallet();
            const abi = requireGrantAbi();
            return wc.writeContract({
                address: addresses.grant,
                abi,
                functionName: 'approveMilestone',
                args: [milestoneId],
            });
        },
        async releasePayout({ milestoneId }) {
            const wc = requireWallet();
            const abi = requireGrantAbi();
            return wc.writeContract({
                address: addresses.grant,
                abi,
                functionName: 'releasePayout',
                args: [milestoneId],
            });
        },
        async getGrantRound(grantId) {
            const abi = requireGrantAbi();
            const [status, applicationsCount] = await publicClient.readContract({
                address: addresses.grant,
                abi,
                functionName: 'getGrantRound',
                args: [grantId],
            });
            const statusMap = { 0: 'open', 1: 'closed', 2: 'archived' };
            return { id: grantId, status: statusMap[status] ?? 'open', applicationsCount };
        },
        async getGrantApplication(applicationId) {
            const abi = requireGrantAbi();
            const [applicant, status, metadataUri] = await publicClient.readContract({
                address: addresses.grant,
                abi,
                functionName: 'getGrantApplication',
                args: [applicationId],
            });
            const statusMap = {
                0: 'submitted',
                1: 'approved',
                2: 'rejected',
            };
            return { id: applicationId, applicant, status: statusMap[status] ?? 'submitted', metadataUri };
        },
        async getMilestones(applicationId) {
            const abi = requireGrantAbi();
            const raw = await publicClient.readContract({
                address: addresses.grant,
                abi,
                functionName: 'getMilestones',
                args: [applicationId],
            });
            const statusMap = {
                0: 'pending',
                1: 'evidence-submitted',
                2: 'approved',
                3: 'paid',
            };
            return raw.map(([id, status, evidenceUri]) => ({
                id,
                status: statusMap[status] ?? 'pending',
                evidenceUri: evidenceUri || undefined,
            }));
        },
    };
}
