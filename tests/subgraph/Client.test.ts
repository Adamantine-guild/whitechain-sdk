import { describe, it, expect, vi } from "vitest";
import { SubgraphClient, createSubgraphClient, DEFAULT_SUBGRAPH_URL } from "../../src/subgraph/Client.js";
import { WhiteChainError } from "../../src/types.js";

describe("SubgraphClient", () => {
  it("initializes with default subgraph URL if none provided", () => {
    const client = new SubgraphClient({ fetchFn: vi.fn() });
    expect(client.url).toBe(DEFAULT_SUBGRAPH_URL);
    expect(client.syncWarningThreshold).toBe(50);
  });

  it("supports passing custom Subgraph URLs for local graph node testing", () => {
    const customUrl = "http://localhost:8000/subgraphs/name/local-node";
    const client = createSubgraphClient({
      url: customUrl,
      syncWarningThreshold: 20,
      fetchFn: vi.fn(),
    });
    expect(client.url).toBe(customUrl);
    expect(client.syncWarningThreshold).toBe(20);
  });

  it("fetches top traders with pagination and sorting variables", async () => {
    const mockTraders = [
      {
        id: "0x1",
        address: "0x1111111111111111111111111111111111111111",
        totalVolume: "500000.50",
        tradeCount: 42,
        lastTradeTimestamp: 1700000000,
        profitUsd: "45000.00",
      },
      {
        id: "0x2",
        address: "0x2222222222222222222222222222222222222222",
        totalVolume: "250000.00",
        tradeCount: 18,
        lastTradeTimestamp: 1699900000,
        profitUsd: "12000.00",
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { traders: mockTraders } }),
    });

    const client = new SubgraphClient({ fetchFn: mockFetch as any });
    const traders = await client.getTopTraders({ limit: 5, skip: 10, orderBy: "totalVolume" });

    expect(traders).toEqual(mockTraders);
    expect(mockFetch).toHaveBeenCalledWith(
      DEFAULT_SUBGRAPH_URL,
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"first":5'),
      })
    );
    expect(mockFetch.mock.calls[0][1].body).toContain('"skip":10');
  });

  it("fetches vault snapshots for a specific vault address", async () => {
    const mockSnapshots = [
      {
        id: "snap-1",
        vault: "0xvault",
        totalAssets: "1000000",
        totalSupply: "950000",
        sharePrice: "1.0526",
        timestamp: 1700000000,
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { vaultSnapshots: mockSnapshots } }),
    });

    const client = new SubgraphClient({ fetchFn: mockFetch as any });
    const snapshots = await client.getVaultSnapshots("0xVault", 10);

    expect(snapshots).toEqual(mockSnapshots);
    expect(mockFetch.mock.calls[0][1].body).toContain('"vault":"0xvault"');
  });

  it("calculates sync status and generates warning when subgraph lags behind chainhead", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const mockMetaResponse = {
      _meta: {
        block: {
          number: 1000,
          hash: "0xhash",
          timestamp: 1700000000,
        },
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockMetaResponse }),
    });

    const client = new SubgraphClient({
      syncWarningThreshold: 50,
      fetchFn: mockFetch as any,
    });

    // Case 1: Synced (lag = 10 <= 50)
    const statusSynced = await client.getSyncStatus(1010);
    expect(statusSynced.isSynced).toBe(true);
    expect(statusSynced.blockLag).toBe(10);
    expect(statusSynced.warning).toBeUndefined();

    // Case 2: Lagging (lag = 100 > 50)
    const statusLagging = await client.getSyncStatus(1100);
    expect(statusLagging.isSynced).toBe(false);
    expect(statusLagging.blockLag).toBe(100);
    expect(statusLagging.warning).toContain("Subgraph is lagging behind chainhead by 100 blocks");
    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it("handles GraphQL errors and HTTP errors by throwing WhiteChainError", async () => {
    // HTTP Error
    const mockHttpErrorFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const clientHttpErr = new SubgraphClient({ fetchFn: mockHttpErrorFetch as any });
    await expect(clientHttpErr.getTopTraders()).rejects.toThrow(WhiteChainError);

    // GraphQL Error
    const mockGraphQLErrorFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        errors: [{ message: "Field 'invalid' does not exist on type 'Query'" }],
      }),
    });

    const clientGqlErr = new SubgraphClient({ fetchFn: mockGraphQLErrorFetch as any });
    await expect(clientGqlErr.getTopTraders()).rejects.toThrow(WhiteChainError);
  });
});
