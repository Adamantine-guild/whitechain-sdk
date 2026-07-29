import { describe, it, expect, vi } from "vitest";
import {
  Multicall,
  createMulticall,
  DEFAULT_MULTICALL3_ADDRESS,
  encodeAggregate3,
  decodeAggregate3Results,
} from "../../src/core/Multicall.js";
import { WhiteChainError } from "../../src/types.js";
import type { Multicall3Call } from "../../src/types/multicall.js";

describe("Multicall", () => {
  it("uses DEFAULT_MULTICALL3_ADDRESS by default and allows address override", () => {
    const rpcFetchFn = vi.fn();
    const defaultClient = new Multicall(rpcFetchFn);
    expect(defaultClient.multicallAddress).toBe(DEFAULT_MULTICALL3_ADDRESS);

    const customAddress = "0x1111111111111111111111111111111111111111";
    const customClient = createMulticall(rpcFetchFn, { multicallAddress: customAddress });
    expect(customClient.multicallAddress).toBe(customAddress);
  });

  it("batches 50 view queries into exactly 1 HTTP RPC request", async () => {
    let rpcCallCount = 0;

    const mockRpcFetchFn = vi.fn().mockImplementation(async (method: string, params: any[]) => {
      if (method === "eth_call") {
        rpcCallCount++;
        const to = params[0].to;
        expect(to).toBe(DEFAULT_MULTICALL3_ADDRESS);

        // Build a mock ABI response for 50 calls
        // Result array header: offset (0x20), count (50)
        let hex = "0000000000000000000000000000000000000000000000000000000000000020";
        hex += (50).toString(16).padStart(64, "0");

        // Array struct pointers (50 elements * 32 bytes)
        const elementSize = 32 + 32 + 32 + 32 + 32; // 160 bytes = 0xa0 per struct
        for (let i = 0; i < 50; i++) {
          const structOffset = 50 * 32 + i * 160;
          hex += structOffset.toString(16).padStart(64, "0");
        }

        // 50 Result structs (success = 1, returnData = 32 bytes value)
        for (let i = 0; i < 50; i++) {
          hex += "0000000000000000000000000000000000000000000000000000000000000001"; // success = true
          hex += "0000000000000000000000000000000000000000000000000000000000000040"; // bytes offset = 0x40
          hex += "0000000000000000000000000000000000000000000000000000000000000020"; // bytes length = 32
          hex += (i + 1).toString(16).padStart(64, "0"); // uint256 value (i + 1)
          hex += "0000000000000000000000000000000000000000000000000000000000000000"; // padding
        }

        return `0x${hex}`;
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const multicall = new Multicall(mockRpcFetchFn);

    // Create 50 calls
    const calls: Multicall3Call[] = Array.from({ length: 50 }, (_, idx) => ({
      target: `0x${(idx + 1).toString(16).padStart(40, "0")}`,
      callData: "0x70a082310000000000000000000000001111111111111111111111111111111111111111", // balanceOf
      decoder: (hex) => BigInt(hex),
    }));

    const results = await multicall.execute(calls);

    // ACCEPTANCE CRITERIA: Batching 50 queries results in EXACTLY 1 HTTP RPC request
    expect(rpcCallCount).toBe(1);
    expect(mockRpcFetchFn).toHaveBeenCalledTimes(1);

    expect(results).toHaveLength(50);
    expect(results[0].success).toBe(true);
    expect(results[0].value).toBe(1n);
    expect(results[49].value).toBe(50n);
  });

  it("handles partial failures gracefully when allowFailure is true", async () => {
    const mockRpcFetchFn = vi.fn().mockImplementation(async () => {
      // Return data for 2 calls: call 0 succeeded, call 1 failed
      let hex = "0000000000000000000000000000000000000000000000000000000000000020";
      hex += (2).toString(16).padStart(64, "0"); // 2 items

      const offset0 = (2 * 32).toString(16).padStart(64, "0");
      const offset1 = (2 * 32 + 160).toString(16).padStart(64, "0");
      hex += offset0 + offset1;

      // Call 0: Success
      hex += "0000000000000000000000000000000000000000000000000000000000000001"; // success = true
      hex += "0000000000000000000000000000000000000000000000000000000000000040";
      hex += "0000000000000000000000000000000000000000000000000000000000000020";
      hex += "0000000000000000000000000000000000000000000000000000000000000064"; // 100
      hex += "0000000000000000000000000000000000000000000000000000000000000000";

      // Call 1: Reverted (success = 0)
      hex += "0000000000000000000000000000000000000000000000000000000000000000"; // success = false
      hex += "0000000000000000000000000000000000000000000000000000000000000040";
      hex += "0000000000000000000000000000000000000000000000000000000000000000"; // 0 length
      hex += "0000000000000000000000000000000000000000000000000000000000000000";
      hex += "0000000000000000000000000000000000000000000000000000000000000000";

      return `0x${hex}`;
    });

    const multicall = new Multicall(mockRpcFetchFn);

    const calls: Multicall3Call[] = [
      {
        target: "0x1111111111111111111111111111111111111111",
        callData: "0x70a08231",
        allowFailure: true,
        decoder: (hex) => BigInt(hex),
      },
      {
        target: "0x2222222222222222222222222222222222222222",
        callData: "0x70a08231",
        allowFailure: true,
        decoder: (hex) => BigInt(hex),
      },
    ];

    const results = await multicall.execute(calls);

    expect(results[0].success).toBe(true);
    expect(results[0].value).toBe(100n);

    // Call 1 failed gracefully without throwing, returning success = false
    expect(results[1].success).toBe(false);
    expect(results[1].error).toBe("Call reverted or failed execution on-chain.");
    expect(results[1].value).toBeUndefined();
  });

  it("throws WhiteChainError if input calls array is empty or eth_call fails", async () => {
    const mockFetchFn = vi.fn().mockResolvedValue(null);
    const multicall = new Multicall(mockFetchFn);

    await expect(multicall.execute([])).rejects.toThrow(WhiteChainError);
    await expect(
      multicall.execute([{ target: "0x1", callData: "0x1234" }])
    ).rejects.toThrow(WhiteChainError);
  });
});
