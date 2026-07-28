import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnsResolver } from '../../src/providers/EnsResolver.js';
import { encodeFunctionResult } from 'viem';

const universalResolverAbi = [
  {
    inputs: [{ internalType: 'bytes', name: 'reverseName', type: 'bytes' }],
    name: 'reverse',
    outputs: [
      { internalType: 'string', name: 'resolvedName', type: 'string' },
      { internalType: 'address', name: 'resolvedAddress', type: 'address' },
      { internalType: 'address', name: 'reverseResolver', type: 'address' },
      { internalType: 'address', name: 'resolver', type: 'address' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

describe('EnsResolver', () => {
  let fetchFn: ReturnType<typeof vi.fn>;
  let resolver: EnsResolver;

  beforeEach(() => {
    fetchFn = vi.fn();
    resolver = new EnsResolver(fetchFn as unknown as import("../../src/core/TransactionHelper.js").RpcFetchFn);
  });

  it('returns the ENS name for a valid address', async () => {
    // Mock the ABI encoded response from the Universal Resolver
    const mockResponse = encodeFunctionResult({
      abi: universalResolverAbi,
      functionName: 'reverse',
      result: ['vitalik.eth', '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000'],
    });
    fetchFn.mockResolvedValue(mockResponse);

    const name = await resolver.lookupAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    
    expect(name).toBe('vitalik.eth');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    
    // Verify it passes the correct format to eth_call
    const callArgs = fetchFn.mock.calls[0];
    expect(callArgs[0]).toBe('eth_call');
    expect(callArgs[1][0].to).toBe('0xc0497E381f536Be9ce14B0dD3817cBcAe57d2F62');
  });

  it('returns null if the ENS record does not exist (empty string)', async () => {
    const mockResponse = encodeFunctionResult({
      abi: universalResolverAbi,
      functionName: 'reverse',
      result: ['', '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000'],
    });
    fetchFn.mockResolvedValue(mockResponse);

    const name = await resolver.lookupAddress('0x0000000000000000000000000000000000000000');
    expect(name).toBeNull();
  });

  it('returns null and caches it if the contract reverts or returns 0x', async () => {
    fetchFn.mockResolvedValue('0x'); // Common response for empty contract/revert in some nodes

    const name = await resolver.lookupAddress('0xabc0000000000000000000000000000000000000');
    expect(name).toBeNull();
  });

  it('caches the results properly', async () => {
    const mockResponse = encodeFunctionResult({
      abi: universalResolverAbi,
      functionName: 'reverse',
      result: ['nick.eth', '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000'],
    });
    fetchFn.mockResolvedValue(mockResponse);

    // Call 1
    const name1 = await resolver.lookupAddress('0x1230000000000000000000000000000000000000');
    // Call 2
    const name2 = await resolver.lookupAddress('0x1230000000000000000000000000000000000000');

    expect(name1).toBe('nick.eth');
    expect(name2).toBe('nick.eth');
    
    // fetchFn should only be called once because of caching
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
