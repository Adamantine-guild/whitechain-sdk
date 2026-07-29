export interface SubgraphClientOptions {
  /**
   * The GraphQL endpoint URL of the WhiteChain Subgraph.
   * Can be overridden with local Graph node URLs for testing (e.g. http://localhost:8000/subgraphs/name/custom).
   */
  url?: string;

  /**
   * Number of blocks the subgraph can lag behind chainhead before triggering a sync warning.
   * @default 50
   */
  syncWarningThreshold?: number;

  /**
   * Custom fetch implementation for Node or browser environments.
   */
  fetchFn?: typeof fetch;
}

export interface Trader {
  id: string;
  address: string;
  totalVolume: string;
  tradeCount: number;
  lastTradeTimestamp: number;
  profitUsd: string;
}

export interface Trade {
  id: string;
  hash: string;
  trader: string;
  pair: string;
  amountIn: string;
  amountOut: string;
  volumeUsd: string;
  timestamp: number;
  blockNumber: number;
}

export interface VaultSnapshot {
  id: string;
  vault: string;
  totalAssets: string;
  totalSupply: string;
  sharePrice: string;
  timestamp: number;
}

export interface SubgraphMetaBlock {
  number: number;
  hash?: string;
  timestamp?: number;
}

export interface SubgraphMetaResponse {
  _meta: {
    block: SubgraphMetaBlock;
    deployment?: string;
    hasIndexingErrors?: boolean;
  };
}

export interface SubgraphSyncStatus {
  currentBlock: number;
  chainHeadBlock?: number;
  blockLag: number;
  isSynced: boolean;
  warning?: string;
}

export interface GetTopTradersOptions {
  limit?: number;
  skip?: number;
  orderBy?: "totalVolume" | "tradeCount" | "profitUsd";
  orderDirection?: "asc" | "desc";
}

export interface GetTradesOptions {
  traderAddress?: string;
  limit?: number;
  skip?: number;
}
