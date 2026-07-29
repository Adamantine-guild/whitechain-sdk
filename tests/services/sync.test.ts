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
