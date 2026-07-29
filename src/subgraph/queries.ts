export const GET_TOP_TRADERS_QUERY = `
  query GetTopTraders($first: Int!, $skip: Int!, $orderBy: Trader_orderBy, $orderDirection: OrderDirection) {
    traders(first: $first, skip: $skip, orderBy: $orderBy, orderDirection: $orderDirection) {
      id
      address
      totalVolume
      tradeCount
      lastTradeTimestamp
      profitUsd
    }
  }
`;

export const GET_TRADES_QUERY = `
  query GetTrades($first: Int!, $skip: Int!, $trader: String) {
    trades(
      first: $first,
      skip: $skip,
      where: $trader ? { trader: $trader } : {}
      orderBy: timestamp,
      orderDirection: desc
    ) {
      id
      hash
      trader
      pair
      amountIn
      amountOut
      volumeUsd
      timestamp
      blockNumber
    }
  }
`;

export const GET_VAULT_SNAPSHOTS_QUERY = `
  query GetVaultSnapshots($vault: String!, $first: Int!) {
    vaultSnapshots(
      first: $first,
      where: { vault: $vault },
      orderBy: timestamp,
      orderDirection: desc
    ) {
      id
      vault
      totalAssets
      totalSupply
      sharePrice
      timestamp
    }
  }
`;

export const GET_SUBGRAPH_META_QUERY = `
  query GetSubgraphMeta {
    _meta {
      block {
        number
        hash
        timestamp
      }
      deployment
      hasIndexingErrors
    }
  }
`;
