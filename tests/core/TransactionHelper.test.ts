import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionHelper } from '../../src/core/TransactionHelper.js';

describe('TransactionHelper', () => {
  let fetchFn: ReturnType<typeof vi.fn>;
  let helper: TransactionHelper;

  beforeEach(() => {
    fetchFn = vi.fn();
    helper = new TransactionHelper(fetchFn);
  });

  it('estimates gas and applies the default 1.2x buffer correctly', async () => {
    // 100,000 raw estimate
    fetchFn.mockResolvedValue('0x186a0');

    const tx = { to: '0x123', value: '0x0' };
    const result = await helper.estimateGas(tx);

    expect(fetchFn).toHaveBeenCalledWith('eth_estimateGas', [tx, 'latest']);
    
    // 100,000 * 1.2 = 120,000
    expect(result).toBe(120000n);
  });

  it('allows overriding the multiplier on a per-call basis', async () => {
    // 100,000 raw estimate
    fetchFn.mockResolvedValue('0x186a0');

    const tx = { to: '0x123', value: '0x0' };
    const result = await helper.estimateGas(tx, { multiplier: 1.5 });

    // 100,000 * 1.5 = 150,000
    expect(result).toBe(150000n);
  });

  it('allows setting a global default multiplier', async () => {
    // 100,000 raw estimate
    fetchFn.mockResolvedValue('0x186a0');
    
    helper.setDefaultMultiplier(1.1);

    const tx = { to: '0x123', value: '0x0' };
    const result = await helper.estimateGas(tx);

    // 100,000 * 1.1 = 110,000
    expect(result).toBe(110000n);
  });

  it('handles gas estimates with precision multipliers properly', async () => {
    // 21,000 raw estimate (standard transfer)
    fetchFn.mockResolvedValue('0x5208');

    const tx = { to: '0x123', value: '0x0' };
    const result = await helper.estimateGas(tx, { multiplier: 1.05 }); // 5% buffer

    // 21,000 * 1.05 = 22,050
    expect(result).toBe(22050n);
  });

  it('throws an error if a multiplier less than 1 is provided', async () => {
    fetchFn.mockResolvedValue('0x186a0');
    const tx = { to: '0x123', value: '0x0' };

    await expect(helper.estimateGas(tx, { multiplier: 0.9 })).rejects.toThrow('Multiplier must be at least 1.0');
    
    expect(() => helper.setDefaultMultiplier(0.99)).toThrow('Multiplier must be at least 1.0');
  });

  it('throws an error if the RPC response is invalid', async () => {
    fetchFn.mockResolvedValue(null);
    const tx = { to: '0x123' };

    await expect(helper.estimateGas(tx)).rejects.toThrow('Invalid response from eth_estimateGas');
  });
});
