import type { PublicClient, Log } from 'viem';

export interface ProgressInfo {
  current: number;
  total: number;
  percentage: number;
}

export interface HistoricalSyncOptions {
  maxChunkSize?: number;
  concurrency?: number;
  onProgress?: (info: ProgressInfo) => void;
}

export type RawLog = Log;
export type LogFilter = {
  address?: `0x${string}` | `0x${string}`[];
  events?: any; // To keep it simple and viem-compatible
  args?: any;
  strict?: boolean;
};

export class HistoricalSync {
  private client: PublicClient;

  constructor(client: PublicClient) {
    this.client = client;
  }

  /**
   * Automatically chunks historical queries into safe ranges, manages rate limits,
   * handles "response size too large" errors by halving the range dynamically,
   * and merges the results seamlessly.
   */
  public async getLogsChunked(
    filter: LogFilter,
    fromBlock: bigint,
    toBlock: bigint,
    options?: HistoricalSyncOptions
  ): Promise<RawLog[]> {
    const maxChunkSize = BigInt(options?.maxChunkSize ?? 5000);
    const concurrency = options?.concurrency ?? 5;
    const totalBlocks = toBlock - fromBlock + 1n;
    
    let processedBlocks = 0n;

    // Define the queue of chunk ranges to process
    type ChunkRange = { start: bigint; end: bigint };
    const queue: ChunkRange[] = [];
    
    for (let current = fromBlock; current <= toBlock; current += maxChunkSize) {
      const end = current + maxChunkSize - 1n;
      queue.push({
        start: current,
        end: end > toBlock ? toBlock : end
      });
    }

    const allLogs: RawLog[] = [];
    
    // Concurrency pool executor
    const executePool = async () => {
      const activePromises: Set<Promise<void>> = new Set();
      
      while (queue.length > 0 || activePromises.size > 0) {
        if (activePromises.size >= concurrency || (queue.length === 0 && activePromises.size > 0)) {
          await Promise.race(activePromises);
        }
        
        const chunk = queue.shift();
        if (!chunk) continue;
        
        const promise = this.fetchChunkWithRetry(chunk.start, chunk.end, filter, queue)
          .then((logs) => {
            allLogs.push(...logs);
            processedBlocks += (chunk.end - chunk.start + 1n);
            if (options?.onProgress) {
              const current = Number(processedBlocks);
              const total = Number(totalBlocks);
              options.onProgress({
                current,
                total,
                percentage: Math.min(100, Math.round((current / total) * 100))
              });
            }
          })
          .catch((error) => {
            if (error instanceof ChunkSplitError) {
              // The chunk was successfully split and added to the queue, no need to fail the pool.
              // Do nothing, the sub-chunks will be processed in subsequent iterations.
            } else {
              throw error; // Bubble up unexpected errors
            }
          })
          .finally(() => {
            activePromises.delete(promise);
          });
          
        activePromises.add(promise);
      }
      
      // Wait for the remaining promises to complete
      await Promise.all(activePromises);
    };

    await executePool();

    // Sort logs deterministically: ascending by block number, then by log index
    return allLogs.sort((a, b) => {
      const blockDiff = (a.blockNumber || 0n) - (b.blockNumber || 0n);
      if (blockDiff !== 0n) {
        return blockDiff > 0n ? 1 : -1;
      }
      const logIndexDiff = (a.logIndex || 0) - (b.logIndex || 0);
      return logIndexDiff > 0 ? 1 : logIndexDiff < 0 ? -1 : 0;
    });
  }

  private async fetchChunkWithRetry(
    start: bigint,
    end: bigint,
    filter: LogFilter,
    queue: { start: bigint; end: bigint }[]
  ): Promise<RawLog[]> {
    try {
      const logs = await this.client.getLogs({
        ...(filter as any),
        fromBlock: start,
        toBlock: end
      });
      return logs as RawLog[];
    } catch (error: any) {
      const errorMessage = error?.message?.toLowerCase() || '';
      // Check for RPC node limits: limit exceeded, response size too large, timeout
      const isSizeLimitError = 
        errorMessage.includes('limit') || 
        errorMessage.includes('size') || 
        errorMessage.includes('too large') || 
        errorMessage.includes('timeout') ||
        errorMessage.includes('10k');
        
      if (isSizeLimitError) {
        // Range is too large, split it in half and prepend to queue
        const range = end - start;
        if (range === 0n) {
          // Cannot split a single block any further
          throw new Error(`RPC node rejected single block query for block ${start}: ${error.message}`);
        }
        
        const mid = start + range / 2n;
        
        // Add split chunks to the front of the queue to process them before advancing
        queue.unshift(
          { start: start, end: mid },
          { start: mid + 1n, end: end }
        );
        
        // Return empty logs for this failed overarching chunk, since its sub-chunks 
        // will fetch the logs and update progress appropriately.
        // Wait, if we return empty array here, `processedBlocks` will be incremented 
        // for the overarching chunk which is wrong. 
        // We shouldn't throw error if we caught it, but we need to tell the caller not to count it.
        // Let's modify the queue processing to just insert into the queue without returning a result here,
        // but `processedBlocks` counts this chunk.
        
        throw new ChunkSplitError('Chunk split needed');
      }
      
      throw error;
    }
  }
}

class ChunkSplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChunkSplitError';
  }
}

/**
 * Convenience function to quickly fetch chunked logs without instantiating the class manually.
 */
export async function getLogsChunked(
  client: PublicClient,
  filter: LogFilter,
  fromBlock: bigint,
  toBlock: bigint,
  options?: HistoricalSyncOptions
): Promise<RawLog[]> {
  const sync = new HistoricalSync(client);
  return sync.getLogsChunked(filter, fromBlock, toBlock, options);
}
