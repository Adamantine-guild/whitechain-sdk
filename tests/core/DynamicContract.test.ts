import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamicContract } from '../../src/core/DynamicContract.js';
import { encodeFunctionResult } from 'viem';

describe('DynamicContract', () => {
  let fetchFn: ReturnType<typeof vi.fn>;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchFn = vi.fn();
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as any;
  });

  it('allows calling arbitrary methods matching the fetched ABI', async () => {
    const mockAbi = [
      {
        type: 'function',
        name: 'balanceOf',
        stateMutability: 'view',
        inputs: [{ type: 'address', name: 'account' }],
        outputs: [{ type: 'uint256', name: 'balance' }]
      }
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: '1', result: JSON.stringify(mockAbi) }),
    });
    fetchFn.mockResolvedValue('0x0'); // Not a proxy

    const contract = await DynamicContract.create('0x123', fetchFn);

    // Mock the RPC response for balanceOf
    const mockBalance = 1000n;
    const encodedResponse = encodeFunctionResult({
      abi: mockAbi,
      functionName: 'balanceOf',
      result: mockBalance
    });
    
    // Using mockImplementationOnce for the eth_call inside the proxy
    fetchFn.mockResolvedValueOnce(encodedResponse);

    const balance = await contract.balanceOf('0x0000000000000000000000000000000000000abc');
    
    expect(balance).toBe(mockBalance);
    expect(fetchFn).toHaveBeenCalledWith('eth_call', expect.anything());
  });

  it('returns undefined for methods not in the ABI', async () => {
    const mockAbi = [{ type: 'function', name: 'transfer', stateMutability: 'nonpayable' }];
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: '1', result: JSON.stringify(mockAbi) }),
    });
    fetchFn.mockResolvedValue('0x0');

    const contract = await DynamicContract.create('0x123', fetchFn);
    
    expect(contract.nonExistentMethod).toBeUndefined();
  });
});
