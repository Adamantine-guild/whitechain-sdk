import { describe, it, expect, vi } from 'vitest';
import { createGrantChainClient } from '../src';
const dummyAbi = [
    { type: 'function', name: 'submitApplication', stateMutability: 'nonpayable', inputs: [
            { name: 'grantId', type: 'uint256' },
            { name: 'applicant', type: 'address' },
            { name: 'metadataUri', type: 'string' },
        ], outputs: [] },
    { type: 'function', name: 'approveApplication', stateMutability: 'nonpayable', inputs: [
            { name: 'applicationId', type: 'uint256' },
        ], outputs: [] },
    { type: 'function', name: 'submitMilestoneEvidence', stateMutability: 'nonpayable', inputs: [
            { name: 'milestoneId', type: 'uint256' },
            { name: 'evidenceUri', type: 'string' },
        ], outputs: [] },
    { type: 'function', name: 'approveMilestone', stateMutability: 'nonpayable', inputs: [
            { name: 'milestoneId', type: 'uint256' },
        ], outputs: [] },
    { type: 'function', name: 'releasePayout', stateMutability: 'nonpayable', inputs: [
            { name: 'milestoneId', type: 'uint256' },
        ], outputs: [] },
    { type: 'function', name: 'getGrantRound', stateMutability: 'view', inputs: [
            { name: 'grantId', type: 'uint256' },
        ], outputs: [{ name: 'status', type: 'uint8' }, { name: 'applicationsCount', type: 'uint256' }] },
    { type: 'function', name: 'getGrantApplication', stateMutability: 'view', inputs: [
            { name: 'applicationId', type: 'uint256' },
        ], outputs: [{ name: 'applicant', type: 'address' }, { name: 'status', type: 'uint8' }, { name: 'metadataUri', type: 'string' }] },
    { type: 'function', name: 'getMilestones', stateMutability: 'view', inputs: [
            { name: 'applicationId', type: 'uint256' },
        ], outputs: [{ name: 'milestones', type: 'tuple[]', components: [
                    { name: 'id', type: 'uint256' },
                    { name: 'status', type: 'uint8' },
                    { name: 'evidenceUri', type: 'string' },
                ] }] },
];
const grantAddress = '0x000000000000000000000000000000000000dEaD';
describe('GrantChainClient', () => {
    it('calls write methods with expected args', async () => {
        const writeContract = vi.fn().mockResolvedValue('0xhash');
        const readContract = vi.fn();
        const client = createGrantChainClient({
            // use any to avoid heavy chain typing for unit tests
            chain: {},
            transport: {},
            addresses: { grant: grantAddress },
            abis: { grant: dummyAbi },
            clients: {
                publicClient: { readContract },
                walletClient: { writeContract },
            },
        });
        await client.submitApplication({ grantId: 1n, applicant: grantAddress, metadataUri: 'ipfs://demo' });
        expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({
            address: grantAddress,
            functionName: 'submitApplication',
            args: [1n, grantAddress, 'ipfs://demo'],
        }));
        await client.approveApplication({ applicationId: 2n });
        expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({
            functionName: 'approveApplication',
            args: [2n],
        }));
    });
    it('maps read results into simple types', async () => {
        const readContract = vi.fn()
            // getGrantRound
            .mockResolvedValueOnce([1, 5n])
            // getGrantApplication
            .mockResolvedValueOnce([grantAddress, 0, 'ipfs://meta'])
            // getMilestones
            .mockResolvedValueOnce([[1n, 2, 'ipfs://e1'], [2n, 3, '']]);
        const client = createGrantChainClient({
            chain: {},
            transport: {},
            addresses: { grant: grantAddress },
            abis: { grant: dummyAbi },
            clients: {
                publicClient: { readContract },
            },
        });
        const round = await client.getGrantRound(10n);
        expect(round).toEqual({ id: 10n, status: 'closed', applicationsCount: 5n });
        const app = await client.getGrantApplication(3n);
        expect(app).toEqual({ id: 3n, applicant: grantAddress, status: 'submitted', metadataUri: 'ipfs://meta' });
        const milestones = await client.getMilestones(3n);
        expect(milestones).toEqual([
            { id: 1n, status: 'approved', evidenceUri: 'ipfs://e1' },
            { id: 2n, status: 'paid', evidenceUri: undefined },
        ]);
    });
});
