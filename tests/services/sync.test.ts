import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getLogsChunked, HistoricalSync } from '../../src/services/HistoricalSync';
import type { PublicClient, Log } from 'viem';

describe('HistoricalSync', () => {
  let mockClient: any;
  
  beforeEach(() => {
    mockClient = {
      getLogs: vi.fn(),
    };
  });

  it('should fetch logs in chunks successfully', async () => {
    // Mock getLogs to return different logs based on block range
    mockClient.getLogs.mockImplementation(async ({ fromBlock, toBlock }: any) => {
      if (fromBlock === 0n && toBlock === 499n) {
        return [{ blockNumber: 10n, logIndex: 0 } as Log];
      }
      if (fromBlock === 500n && toBlock === 999n) {
        return [{ blockNumber: 600n, logIndex: 1 } as Log];
      }
      return [];
    });

    const progressCb = vi.fn();

    const logs = await getLogsChunked(
      mockClient as PublicClient,
      {},
      0n,
      999n,
      { maxChunkSize: 500, concurrency: 2, onProgress: progressCb }
    );

    expect(mockClient.getLogs).toHaveBeenCalledTimes(2);
    expect(logs).toHaveLength(2);
    expect(logs[0].blockNumber).toBe(10n);
    expect(logs[1].blockNumber).toBe(600n);

    // Verify progress callback
    expect(progressCb).toHaveBeenCalledTimes(2);
    expect(progressCb).toHaveBeenLastCalledWith({
      current: 1000,
      total: 1000,
      percentage: 100,
    });
  });

  it('should dynamically halve chunk size if RPC throws a size limit error', async () => {
    // We want the 0-999 range to fail with a size limit error.
    // It should split into 0-499 and 500-999.
    
    mockClient.getLogs.mockImplementation(async ({ fromBlock, toBlock }: any) => {
      if (fromBlock === 0n && toBlock === 999n) {
        throw new Error('response size too large');
      }
      if (fromBlock === 0n && toBlock === 499n) {
        return [{ blockNumber: 100n, logIndex: 0 } as Log];
      }
      if (fromBlock === 500n && toBlock === 999n) {
        return [{ blockNumber: 800n, logIndex: 1 } as Log];
      }
      return [];
    });

    const progressCb = vi.fn();

    const logs = await getLogsChunked(
      mockClient as PublicClient,
      {},
      0n,
      999n,
      { maxChunkSize: 1000, concurrency: 1, onProgress: progressCb }
    );

    // First call (0-999) fails. 
    // It splits into two calls: (0-499) and (500-999).
    expect(mockClient.getLogs).toHaveBeenCalledTimes(3);
    
    expect(logs).toHaveLength(2);
    expect(logs[0].blockNumber).toBe(100n);
    expect(logs[1].blockNumber).toBe(800n);
    
    // Progress should eventually reach 100% since both chunks succeed
    expect(progressCb).toHaveBeenLastCalledWith({
      current: 1000,
      total: 1000,
      percentage: 100,
    });
  });

  it('should strictly sort returned events by blockNumber and logIndex', async () => {
    // The chunks resolve out of order (simulated by returning mixed arrays 
    // or concurrent delay simulation). Here we just return unordered logs from a mock.
    mockClient.getLogs.mockImplementation(async () => {
      return [
        { blockNumber: 500n, logIndex: 2 },
        { blockNumber: 500n, logIndex: 1 },
        { blockNumber: 10n, logIndex: 0 },
        { blockNumber: 10n, logIndex: 1 },
        { blockNumber: 600n, logIndex: 0 },
      ] as Log[];
    });

    const logs = await getLogsChunked(
      mockClient as PublicClient,
      {},
      0n,
      999n,
      { maxChunkSize: 1000 }
    );

    // Assert sorting
    expect(logs).toHaveLength(5);
    expect(logs[0]).toEqual({ blockNumber: 10n, logIndex: 0 });
    expect(logs[1]).toEqual({ blockNumber: 10n, logIndex: 1 });
    expect(logs[2]).toEqual({ blockNumber: 500n, logIndex: 1 });
    expect(logs[3]).toEqual({ blockNumber: 500n, logIndex: 2 });
    expect(logs[4]).toEqual({ blockNumber: 600n, logIndex: 0 });
  });
});
import { describe, it, expect, vi } from 'vitest'
import { getLogsChunked, HistoricalSync, type RawLog } from '../../src/services/HistoricalSync.js'

describe('HistoricalSync Service (getLogsChunked)', () => {
  it('automatically splits 1,000,000 blocks into chunks and returns ordered logs', async () => {
    const fromBlock = 1n
    const toBlock = 1_000_000n

    const mockGetLogs = vi.fn().mockImplementation(async ({ fromBlock: from, toBlock: to }) => {
      // Return a dummy log for each chunk
      return [
        {
          address: '0x123',
          topics: [],
          data: '0x',
          blockNumber: to,
          transactionHash: '0xtx',
          transactionIndex: 0,
          blockHash: '0xblock',
          logIndex: 1,
        },
        {
          address: '0x123',
          topics: [],
          data: '0x',
          blockNumber: from,
          transactionHash: '0xtx',
          transactionIndex: 0,
          blockHash: '0xblock',
          logIndex: 0,
        },
      ]
    })

    const progressLogs: number[] = []

    const logs = await getLogsChunked({
      getLogsFn: mockGetLogs,
      fromBlock,
      toBlock,
      maxChunkSize: 200_000n, // Split 1,000,000 blocks into 200k chunks
      concurrency: 5,
      onProgress: (p) => {
        progressLogs.push(p.percentage)
      },
    })

    expect(logs.length).toBeGreaterThan(0)
    expect(progressLogs.length).toBeGreaterThan(0)
    expect(progressLogs[progressLogs.length - 1]).toBe(100)

    // Verify strict sorting by blockNumber ascending, then logIndex ascending
    for (let i = 1; i < logs.length; i++) {
      const prevBlock = BigInt(logs[i - 1].blockNumber)
      const currBlock = BigInt(logs[i].blockNumber)
      if (prevBlock === currBlock) {
        expect(Number(logs[i - 1].logIndex)).toBeLessThanOrEqual(Number(logs[i].logIndex))
      } else {
        expect(prevBlock).toBeLessThan(currBlock)
      }
    }
  })

  it('adaptively halves maxChunkSize when RPC throws a "query exceeds limit" error', async () => {
    let currentMaxLimit = 500n // RPC fails if chunk size > 500

    const mockGetLogs = vi.fn().mockImplementation(async ({ fromBlock: from, toBlock: to }) => {
      const chunkSize = to - from + 1n
      if (chunkSize > currentMaxLimit) {
        throw new Error('RPC Error: query exceeds limit / response size too large')
      }
      return [
        {
          address: '0xabc',
          topics: [],
          data: '0x',
          blockNumber: from,
          transactionHash: '0xtx',
          transactionIndex: 0,
          blockHash: '0xblock',
          logIndex: 0,
        },
      ]
    })

    const logs = await getLogsChunked({
      getLogsFn: mockGetLogs,
      fromBlock: 1n,
      toBlock: 2000n,
      maxChunkSize: 2000n, // Starts at 2000, will fail and halve to 1000, then halve to 500
      concurrency: 2,
    })

    expect(logs.length).toBeGreaterThan(0)
  })
})
