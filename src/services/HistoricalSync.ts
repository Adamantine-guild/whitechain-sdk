import { WhiteChainError } from '../types.js'

export interface LogFilter {
  address?: string | string[]
  topics?: (string | string[] | null)[]
}

export interface RawLog {
  address: string
  topics: string[]
  data: string
  blockNumber: string | bigint
  transactionHash: string
  transactionIndex: string | number
  blockHash: string
  logIndex: string | number
  removed?: boolean
}

export interface ProgressInfo {
  syncedBlocks: bigint
  totalBlocks: bigint
  percentage: number
}

export interface HistoricalSyncOptions {
  getLogsFn: (filter: LogFilter & { fromBlock: bigint; toBlock: bigint }) => Promise<RawLog[]>
  fromBlock: bigint
  toBlock: bigint
  filter?: LogFilter
  maxChunkSize?: bigint
  concurrency?: number
  minChunkSize?: bigint
  onProgress?: (progress: ProgressInfo) => void
}

/**
 * HistoricalSync utility automatically chunks historical getLogs queries into optimal safe ranges,
 * adaptively halves chunk sizes on RPC limit errors, and merges results in strict blockNumber & logIndex order.
 */
export class HistoricalSync {
  public static isLimitError(err: any): boolean {
    if (!err) return false
    const msg = (err.message || String(err)).toLowerCase()
    return (
      msg.includes('limit') ||
      msg.includes('too large') ||
      msg.includes('exceed') ||
      msg.includes('wide') ||
      msg.includes('block range') ||
      msg.includes('-32005') ||
      msg.includes('query returned more than')
    )
  }

  /**
   * Fetches historical logs in parallel chunked block ranges, adaptively halving chunk sizes on RPC limit errors.
   * Merges and strictly sorts logs by blockNumber (ascending) and logIndex (ascending).
   */
  public static async getLogsChunked(options: HistoricalSyncOptions): Promise<RawLog[]> {
    const {
      getLogsFn,
      fromBlock,
      toBlock,
      filter = {},
      maxChunkSize = 2000n,
      concurrency = 5,
      minChunkSize = 10n,
      onProgress,
    } = options

    if (fromBlock > toBlock) {
      throw new WhiteChainError(`fromBlock (${fromBlock}) cannot be greater than toBlock (${toBlock})`)
    }

    const totalBlocks = toBlock - fromBlock + 1n
    let currentChunkSize = maxChunkSize
    const allLogs: RawLog[] = []
    let currentFrom = fromBlock
    let syncedBlocks = 0n

    // Process block ranges in dynamically sized chunks
    while (currentFrom <= toBlock) {
      // Build a batch of chunks up to concurrency limit
      const chunkRanges: { from: bigint; to: bigint }[] = []
      let batchStart = currentFrom

      for (let i = 0; i < concurrency && batchStart <= toBlock; i++) {
        const batchTo = batchStart + currentChunkSize - 1n > toBlock ? toBlock : batchStart + currentChunkSize - 1n
        chunkRanges.push({ from: batchStart, to: batchTo })
        batchStart = batchTo + 1n
      }

      // Execute fetch batch concurrently
      let hasLimitError = false
      const batchPromises = chunkRanges.map(async (range) => {
        try {
          const logs = await getLogsFn({
            ...filter,
            fromBlock: range.from,
            toBlock: range.to,
          })
          return { range, logs, error: null }
        } catch (err: any) {
          return { range, logs: [], error: err }
        }
      })

      const results = await Promise.all(batchPromises)

      // Inspect batch results for RPC response limit errors
      for (const res of results) {
        if (res.error) {
          if (HistoricalSync.isLimitError(res.error)) {
            hasLimitError = true
            break
          } else {
            throw res.error
          }
        }
      }

      if (hasLimitError) {
        // Halve chunk size and retry range segment
        const nextChunk = currentChunkSize / 2n
        currentChunkSize = nextChunk < minChunkSize ? minChunkSize : nextChunk
        continue
      }

      // Success: collect logs and update progress
      for (const res of results) {
        allLogs.push(...res.logs)
        syncedBlocks += res.range.to - res.range.from + 1n
        currentFrom = res.range.to + 1n

        if (onProgress) {
          const percentage = Math.min(100, Number((syncedBlocks * 100n) / totalBlocks))
          onProgress({
            syncedBlocks,
            totalBlocks,
            percentage,
          })
        }
      }
    }

    // Sort strictly by blockNumber (ascending) then logIndex (ascending)
    allLogs.sort((a, b) => {
      const blockA = typeof a.blockNumber === 'string' ? BigInt(a.blockNumber) : BigInt(a.blockNumber)
      const blockB = typeof b.blockNumber === 'string' ? BigInt(b.blockNumber) : BigInt(b.blockNumber)

      if (blockA !== blockB) {
        return blockA < blockB ? -1 : 1
      }

      const indexA = typeof a.logIndex === 'string' ? Number(a.logIndex) : Number(a.logIndex)
      const indexB = typeof b.logIndex === 'string' ? Number(b.logIndex) : Number(b.logIndex)
      return indexA - indexB
    })

    return allLogs
  }
}

export function getLogsChunked(options: HistoricalSyncOptions): Promise<RawLog[]> {
  return HistoricalSync.getLogsChunked(options)
}
