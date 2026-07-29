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

export class SubgraphClient {
  public readonly url: string;
  public readonly syncWarningThreshold: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: SubgraphClientOptions = {}) {
    this.url = options.url || DEFAULT_SUBGRAPH_URL;
    this.syncWarningThreshold = options.syncWarningThreshold ?? 50;
    this.fetchFn = options.fetchFn || globalThis.fetch;

    if (!this.fetchFn) {
      throw new WhiteChainError(
        "Fetch API is not available in the current environment. Please pass a custom 'fetchFn' in SubgraphClientOptions."
      );
    }
  }

  /**
   * Executes a raw GraphQL query against the configured Subgraph endpoint.
   */
  async rawQuery<TData = any, TVariables = Record<string, any>>(
    query: string,
    variables?: TVariables
  ): Promise<TData> {
    try {
      const response = await this.fetchFn(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        throw new WhiteChainError(
          `Subgraph request failed with HTTP status ${response.status}: ${response.statusText}`
        );
      }

      const json = await response.json();

      if (json.errors && json.errors.length > 0) {
        const errorMessages = json.errors.map((e: any) => e.message).join("; ");
        throw new WhiteChainError(`Subgraph GraphQL error: ${errorMessages}`);
      }

      return json.data as TData;
    } catch (err: any) {
      if (err instanceof WhiteChainError) {
        throw err;
      }
      throw new WhiteChainError(`Failed to fetch from Subgraph (${this.url}): ${err.message}`);
    }
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
