import { describe, it, expect, vi, afterEach } from "vitest";
import { SubgraphClient } from "../../src/subgraph/Client.js";
import { WhiteChainError } from "../../src/types.js";

const okResponse = (data: any) => ({
  ok: true,
  json: async () => ({ data }),
});

const errorResponse = (status: number, statusText: string) => ({
  ok: false,
  status,
  statusText,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SubgraphClient retry with exponential backoff", () => {
  it("retries transient 5xx errors up to 3 times by default, then succeeds", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(503, "Service Unavailable"))
      .mockResolvedValueOnce(errorResponse(502, "Bad Gateway"))
      .mockResolvedValueOnce(okResponse({ traders: [] }));

    const client = new SubgraphClient({ fetchFn: mockFetch as any, retryDelay: 0 });
    const data = await client.rawQuery<{ traders: unknown[] }>("query { traders { id } }");

    expect(data).toEqual({ traders: [] });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("gives up after the default 3 retries (4 attempts total) and throws", async () => {
    const mockFetch = vi.fn().mockResolvedValue(errorResponse(500, "Internal Server Error"));

    const client = new SubgraphClient({ fetchFn: mockFetch as any, retryDelay: 0 });

    await expect(client.rawQuery("query { _meta { block { number } } }")).rejects.toThrow(
      WhiteChainError
    );
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("retries network failures (fetch rejection) and succeeds on a later attempt", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(okResponse({ trades: [] }));

    const client = new SubgraphClient({ fetchFn: mockFetch as any, retryDelay: 0 });
    const data = await client.rawQuery<{ trades: unknown[] }>("query { trades { id } }");

    expect(data).toEqual({ trades: [] });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry 400 Bad Request", async () => {
    const mockFetch = vi.fn().mockResolvedValue(errorResponse(400, "Bad Request"));

    const client = new SubgraphClient({ fetchFn: mockFetch as any, retryDelay: 0 });

    await expect(client.rawQuery("query { malformed }")).rejects.toThrow(
      /HTTP status 400/
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry GraphQL-level errors", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ errors: [{ message: "Unknown field 'foo'" }] }),
    });

    const client = new SubgraphClient({ fetchFn: mockFetch as any, retryDelay: 0 });

    await expect(client.rawQuery("query { foo }")).rejects.toThrow(/GraphQL error/);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("allows opting out entirely with retries: 0", async () => {
    const mockFetch = vi.fn().mockResolvedValue(errorResponse(503, "Service Unavailable"));

    const client = new SubgraphClient({ fetchFn: mockFetch as any, retries: 0 });

    await expect(client.rawQuery("query { traders { id } }")).rejects.toThrow(
      /HTTP status 503/
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("waits exponentially longer between retries (500ms, 1s, 2s by default)", async () => {
    vi.useFakeTimers();
    const mockFetch = vi.fn().mockResolvedValue(errorResponse(503, "Service Unavailable"));

    const client = new SubgraphClient({ fetchFn: mockFetch as any });
    const pending = client.rawQuery("query { traders { id } }").catch((e) => e);

    // Attempt 1 fires immediately.
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Retry 1 after 500ms: not at 499ms, yes at 500ms.
    await vi.advanceTimersByTimeAsync(499);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Retry 2 after another 1000ms.
    await vi.advanceTimersByTimeAsync(999);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Retry 3 after another 2000ms.
    await vi.advanceTimersByTimeAsync(1999);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(mockFetch).toHaveBeenCalledTimes(4);

    const err = await pending;
    expect(err).toBeInstanceOf(WhiteChainError);
    expect(String(err)).toMatch(/HTTP status 503/);
  });

  it("respects a custom retryDelay base for the backoff schedule", async () => {
    vi.useFakeTimers();
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(500, "Internal Server Error"))
      .mockResolvedValueOnce(okResponse({ ok: true }));

    const client = new SubgraphClient({
      fetchFn: mockFetch as any,
      retries: 1,
      retryDelay: 100,
    });
    const pending = client.rawQuery("query { traders { id } }");

    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    await expect(pending).resolves.toEqual({ ok: true });
  });
});
