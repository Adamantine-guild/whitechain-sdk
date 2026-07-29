import { describe, it, expect, vi } from 'vitest';
import { Simulator } from '../../src/services/Simulator.js';
import { encodeEventTopics, type Address } from 'viem';

const TRANSFER_ABI = {
  anonymous: false,
  inputs: [
    { indexed: true, name: 'from', type: 'address' },
    { indexed: true, name: 'to', type: 'address' },
    { indexed: false, name: 'value', type: 'uint256' },
  ],
  name: 'Transfer',
  type: 'event',
} as const;

describe('Simulator', () => {
  it('parses debug_traceCall successfully and extracts transfers', async () => {
    const token = '0x1111111111111111111111111111111111111111' as Address;
    const from = '0x2222222222222222222222222222222222222222' as Address;
    const to = '0x3333333333333333333333333333333333333333' as Address;
    
    // We pad the addresses to 32 bytes for topics
    const fromTopic = `0x000000000000000000000000${from.slice(2)}` as `0x${string}`;
    const toTopic = `0x000000000000000000000000${to.slice(2)}` as `0x${string}`;
    
    const topics = encodeEventTopics({
      abi: [TRANSFER_ABI],
      eventName: 'Transfer'
    });
    
    const rawTrace = {
      gasUsed: '0x1234',
      calls: [
        {
          to: token,
          logs: [
            {
              address: token,
              topics: [topics[0], fromTopic, toTopic],
              data: '0x00000000000000000000000000000000000000000000000000000000000003e8' // 1000
            }
          ]
        }
      ]
    };

    const requestMock = vi.fn().mockResolvedValue(rawTrace);
    const publicClient = { request: requestMock } as any;

    const simulator = new Simulator(publicClient);
    
    const res = await simulator.simulateTransaction({ to: '0x4444', data: '0x' });

    expect(res.status).toBe('success');
    expect(res.gasUsed).toBe(BigInt(0x1234));
    expect(res.expectedTransfers).toHaveLength(1);
    expect(res.expectedTransfers[0]).toEqual({
      from,
      to,
      value: 1000n,
      token
    });
  });

  it('falls back to eth_call if trace is not supported', async () => {
    const requestMock = vi.fn().mockImplementation(async ({ method }) => {
      if (method === 'debug_traceCall') {
        throw new Error('Method debug_traceCall not supported');
      }
      if (method === 'eth_call') {
        return '0x0000'; // success return data
      }
    });
    const publicClient = { request: requestMock } as any;

    const simulator = new Simulator(publicClient);
    const res = await simulator.simulateTransaction({ to: '0x4444', data: '0x' });

    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe('success');
    expect(res.expectedTransfers).toHaveLength(0); // can't extract without trace
  });

  it('returns revert status if eth_call fallback fails', async () => {
    const requestMock = vi.fn().mockImplementation(async ({ method }) => {
      if (method === 'debug_traceCall') {
        throw new Error('Method not supported');
      }
      if (method === 'eth_call') {
        throw new Error('execution reverted');
      }
    });
    const publicClient = { request: requestMock } as any;

    const simulator = new Simulator(publicClient);
    const res = await simulator.simulateTransaction({ to: '0x4444', data: '0x' });

    expect(res.status).toBe('revert');
    expect(res.errorReason).toBe('execution reverted');
  });
});
