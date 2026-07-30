import { WhiteChainError } from "../types.js";
import {
  GET_TOP_TRADERS_QUERY,
  GET_TRADES_QUERY,
  GET_VAULT_SNAPSHOTS_QUERY,
  GET_SUBGRAPH_META_QUERY,
} from "./queries.js";
import type {
  SubgraphClientOptions,
  Trader,
  Trade,
  VaultSnapshot,
  SubgraphSyncStatus,
  SubgraphMetaResponse,
  GetTopTradersOptions,
  GetTradesOptions,
} from "./types.js";

export const DEFAULT_SUBGRAPH_URL =
  "https://api.thegraph.com/subgraphs/name/whitechain/mainnet";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SubgraphClient {
  public readonly url: string;
  public readonly syncWarningThreshold: number;
  public readonly retries: number;
  public readonly retryDelay: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: SubgraphClientOptions = {}) {
    this.url = options.url || DEFAULT_SUBGRAPH_URL;
    this.syncWarningThreshold = options.syncWarningThreshold ?? 50;
    this.retries = Math.max(0, options.retries ?? 3);
    this.retryDelay = Math.max(0, options.retryDelay ?? 500);
    this.fetchFn = options.fetchFn || globalThis.fetch;

    if (!this.fetchFn) {
      throw new WhiteChainError(
        "Fetch API is not available in the current environment. Please pass a custom 'fetchFn' in SubgraphClientOptions."
      );
    }
  }

  /**
   * Executes a raw GraphQL query against the configured Subgraph endpoint.
   *
   * Transient failures (network errors and HTTP 5xx responses) are retried
   * automatically up to `retries` times with exponential backoff
   * (retryDelay, retryDelay * 2, retryDelay * 4, ...). Client errors (HTTP 4xx)
   * and GraphQL-level errors are never retried.
   */
  async rawQuery<TData = any, TVariables = Record<string, any>>(
    query: string,
    variables?: TVariables
  ): Promise<TData> {
    const maxAttempts = this.retries + 1;
    let lastErrorMessage = `Failed to fetch from Subgraph (${this.url}).`;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await sleep(this.retryDelay * 2 ** (attempt - 1));
      }
      const isLastAttempt = attempt === maxAttempts - 1;

      let response: Response;
      try {
        response = await this.fetchFn(this.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ query, variables }),
        });
      } catch (err: any) {
        // Network failure or timeout — transient, eligible for retry.
        lastErrorMessage = `Failed to fetch from Subgraph (${this.url}): ${err.message}`;
        if (isLastAttempt) break;
        continue;
      }

      if (!response.ok) {
        const message = `Subgraph request failed with HTTP status ${response.status}: ${response.statusText}`;
        if (response.status >= 500 && !isLastAttempt) {
          // Gateway/server errors are transient — retry with backoff.
          lastErrorMessage = message;
          continue;
        }
        // 4xx responses are permanent client errors and are never retried.
        throw new WhiteChainError(message);
      }

      let json: any;
      try {
        json = await response.json();
      } catch (err: any) {
        // Truncated/invalid body from a flaky gateway — treat as transient.
        lastErrorMessage = `Failed to fetch from Subgraph (${this.url}): ${err.message}`;
        if (isLastAttempt) break;
        continue;
      }

      if (json.errors && json.errors.length > 0) {
        const errorMessages = json.errors.map((e: any) => e.message).join("; ");
        throw new WhiteChainError(`Subgraph GraphQL error: ${errorMessages}`);
      }

      return json.data as TData;
    }

    throw new WhiteChainError(lastErrorMessage);
  }

  /**
   * Fetches top traders indexed by volume, trade count, or profit.
   */
  async getTopTraders(options: GetTopTradersOptions = {}): Promise<Trader[]> {
    const {
      limit = 10,
      skip = 0,
      orderBy = "totalVolume",
      orderDirection = "desc",
    } = options;

    const data = await this.rawQuery<{ traders: Trader[] }>(GET_TOP_TRADERS_QUERY, {
      first: limit,
      skip,
      orderBy,
      orderDirection,
    });

    return data?.traders || [];
  }

  /**
   * Fetches recent trades, optionally filtered by a specific trader address.
   */
  async getTrades(options: GetTradesOptions = {}): Promise<Trade[]> {
    const { limit = 20, skip = 0, traderAddress } = options;

    const data = await this.rawQuery<{ trades: Trade[] }>(GET_TRADES_QUERY, {
      first: limit,
      skip,
      trader: traderAddress ? traderAddress.toLowerCase() : null,
    });

    return data?.trades || [];
  }

  /**
   * Fetches historical performance snapshots for a specific Vault address.
   */
  async getVaultSnapshots(vaultAddress: string, limit = 30): Promise<VaultSnapshot[]> {
    if (!vaultAddress) {
      throw new WhiteChainError("Vault address is required to fetch snapshots.");
    }

    const data = await this.rawQuery<{ vaultSnapshots: VaultSnapshot[] }>(
      GET_VAULT_SNAPSHOTS_QUERY,
      {
        vault: vaultAddress.toLowerCase(),
        first: limit,
      }
    );

    return data?.vaultSnapshots || [];
  }

  /**
   * Checks the sync status of the Subgraph relative to an optional chainHeadBlock parameter.
   */
  async getSyncStatus(chainHeadBlock?: number | bigint): Promise<SubgraphSyncStatus> {
    const data = await this.rawQuery<SubgraphMetaResponse>(GET_SUBGRAPH_META_QUERY);

    if (!data?._meta?.block) {
      throw new WhiteChainError("Invalid response received when querying subgraph _meta.");
    }

    const currentBlock = data._meta.block.number;
    const targetChainHead =
      chainHeadBlock !== undefined ? Number(chainHeadBlock) : currentBlock;

    const blockLag = Math.max(0, targetChainHead - currentBlock);
    const isSynced = blockLag <= this.syncWarningThreshold;

    let warning: string | undefined;

    if (!isSynced) {
      warning = `Subgraph is lagging behind chainhead by ${blockLag} blocks (indexed block: ${currentBlock}, chainhead: ${targetChainHead}). Data may be stale.`;
      console.warn(`[WhiteChain Subgraph Warning] ${warning}`);
    }

    return {
      currentBlock,
      chainHeadBlock: targetChainHead,
      blockLag,
      isSynced,
      warning,
    };
  }
}

/**
 * Factory helper function to instantiate a SubgraphClient instance.
 */
export function createSubgraphClient(options?: SubgraphClientOptions): SubgraphClient {
  return new SubgraphClient(options);
}
