import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ABILoader } from '../../src/services/ABILoader.js';

describe('ABILoader', () => {
  let fetchFn: ReturnType<typeof vi.fn>;
  let loader: ABILoader;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchFn = vi.fn();
    loader = new ABILoader(fetchFn);
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as any;
  });

  it('fetches ABI and caches it', async () => {
    const mockAbi = [{ type: 'function', name: 'balanceOf' }];
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: '1', result: JSON.stringify(mockAbi) }),
    });

    // Mock non-proxy (returns 0x0)
    fetchFn.mockResolvedValue('0x0000000000000000000000000000000000000000000000000000000000000000');

    const abi = await loader.loadContract('0x123', { baseUrl: 'https://api.mock.com' });
    expect(abi).toEqual(mockAbi);

    // Call again, should use cache (mockFetch not called again)
    const abi2 = await loader.loadContract('0x123');
    expect(abi2).toEqual(mockAbi);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('address=0x123');
  });

  it('detects a proxy and fetches the implementation ABI instead', async () => {
    const mockAbi = [{ type: 'function', name: 'logicMethod' }];
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: '1', result: JSON.stringify(mockAbi) }),
    });

    // Mock proxy resolution returning an implementation address 0xabc...
    const implAddressPadded = '0x0000000000000000000000000000000000000000000000000000000000000abc';
    fetchFn.mockResolvedValue(implAddressPadded);

    const abi = await loader.loadContract('0xproxy', { baseUrl: 'https://api.mock.com' });
    
    expect(abi).toEqual(mockAbi);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    
    // The request should be for the logic address, not the proxy address
    expect(mockFetch.mock.calls[0][0]).toContain('address=0x0000000000000000000000000000000000000abc');
  });

  it('throws a readable error for unverified contracts', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: '0', result: 'Contract source code not verified' }),
    });
    fetchFn.mockResolvedValue('0x0');

    await expect(loader.loadContract('0x456')).rejects.toThrow('Contract unverified or ABI not found: Contract source code not verified');
  });
});
