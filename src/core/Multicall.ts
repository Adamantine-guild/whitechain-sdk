import { WhiteChainError } from "../types.js";
import type {
  Multicall3Call,
  Multicall3CallResult,
  Multicall3Options,
} from "../types/multicall.js";

/**
 * Official canonical Multicall3 deployment address on Whitechain and EVM networks.
 */
export const DEFAULT_MULTICALL3_ADDRESS =
  "0xcA11bde05977b3631167028862bE2a173976CA11";

/**
 * Function signature selector for Multicall3 `aggregate3((address,bool,bytes)[])`.
 * keccak256("aggregate3((address,bool,bytes)[])")[0..4] => 0x82ad56cb
 */
export const AGGREGATE3_SELECTOR = "0x82ad56cb";

export type RpcFetchFn = (method: string, params: any[]) => Promise<any>;

/**
 * Encodes an array of Multicall3Call objects into ABI-compliant aggregate3 calldata.
 */
export function encodeAggregate3(
  calls: Multicall3Call[],
  globalAllowFailure = true
): `0x${string}` {
  if (calls.length === 0) {
    throw new WhiteChainError("Multicall requires at least one call in the batch.");
  }

  // ABI Encoding for: aggregate3(Call3[] calls) where Call3 is (address target, bool allowFailure, bytes callData)
  // Dynamic array offset: 0x20 (32 bytes)
  const arrayLenHex = calls.length.toString(16).padStart(64, "0");

  let headBytes = "";
  let tailBytes = "";

  // Head contains relative offsets for each struct element in the array
  const headSize = calls.length * 32;

  let currentTailOffset = headSize;

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    const allowFailure = call.allowFailure ?? globalAllowFailure;

    // Sanitize target address to 32-byte padded hex
    const targetAddrPadded = call.target.toLowerCase().replace(/^0x/, "").padStart(64, "0");
    const allowFailurePadded = (allowFailure ? 1 : 0).toString(16).padStart(64, "0");

    const rawCallData = call.callData.replace(/^0x/, "");
    const callDataLenHex = (rawCallData.length / 2).toString(16).padStart(64, "0");

    // Pad callData to 32-byte boundary
    const paddedCallData = rawCallData.padEnd(Math.ceil(rawCallData.length / 64) * 64 || 64, "0");

    // Struct offset relative to array start
    const structOffsetHex = currentTailOffset.toString(16).padStart(64, "0");
    headBytes += structOffsetHex;

    // Struct layout: target (32b), allowFailure (32b), callData offset (32b = 0x60), callData length (32b), callData content
    const structHead = targetAddrPadded + allowFailurePadded + (0x60).toString(16).padStart(64, "0");
    const structTail = callDataLenHex + paddedCallData;

    const structBytes = structHead + structTail;
    tailBytes += structBytes;

    currentTailOffset += structBytes.length / 2;
  }

  // 0x20 = offset to array data
  const arrayOffsetHex = (0x20).toString(16).padStart(64, "0");
  return `${AGGREGATE3_SELECTOR}${arrayOffsetHex}${arrayLenHex}${headBytes}${tailBytes}` as `0x${string}`;
}

/**
 * Decodes the return bytes from Multicall3 aggregate3 into typed Result structures.
 */
export function decodeAggregate3Results<TCalls extends readonly Multicall3Call[]>(
  returnDataHex: `0x${string}`,
  calls: TCalls
): Multicall3CallResult[] {
  const cleanHex = returnDataHex.replace(/^0x/, "");

  if (cleanHex.length < 64) {
    throw new WhiteChainError("Invalid return data length from Multicall3 aggregate3 call.");
  }

  const results: Multicall3CallResult[] = [];

  // ABI return tuple: Result[] where Result is (bool success, bytes returnData)
  // Skip array offset (32b) and array length (32b)
  const count = parseInt(cleanHex.slice(64, 128), 16);

  if (count !== calls.length) {
    throw new WhiteChainError(
      `Multicall result count mismatch: expected ${calls.length}, got ${count}`
    );
  }

  const arrayDataHex = cleanHex.slice(128);

  for (let i = 0; i < count; i++) {
    const call = calls[i];

    // Read struct head pointer (offset from array data start)
    const structOffset = parseInt(arrayDataHex.slice(i * 64, (i + 1) * 64), 16) * 2;
    const structHex = arrayDataHex.slice(structOffset);

    const success = parseInt(structHex.slice(0, 64), 16) === 1;

    // Bytes offset is structHex.slice(64, 128) -> usually 0x40
    const bytesLen = parseInt(structHex.slice(128, 192), 16);
    const rawBytes = structHex.slice(192, 192 + bytesLen * 2);
    const returnData = `0x${rawBytes}` as `0x${string}`;

    let decodedValue: any = undefined;
    let errorMsg: string | undefined = undefined;

    if (success) {
      if (call.decoder) {
        try {
          decodedValue = call.decoder(returnData);
        } catch (err: any) {
          errorMsg = `Decoder error: ${err.message}`;
        }
      } else {
        decodedValue = returnData;
      }
    } else {
      errorMsg = "Call reverted or failed execution on-chain.";
    }

    results.push({
      success,
      returnData,
      value: decodedValue,
      error: errorMsg,
    });
  }

  return results;
}

export class Multicall {
  public readonly multicallAddress: string;
  public readonly defaultAllowFailure: boolean;
  private readonly rpcFetchFn: RpcFetchFn;

  constructor(rpcFetchFn: RpcFetchFn, options: Multicall3Options = {}) {
    if (!rpcFetchFn) {
      throw new WhiteChainError("RPC fetch function is required for Multicall initialization.");
    }
    this.rpcFetchFn = rpcFetchFn;
    this.multicallAddress = options.multicallAddress || DEFAULT_MULTICALL3_ADDRESS;
    this.defaultAllowFailure = options.allowFailure ?? true;
  }

  /**
   * Batches multiple view calls into a single RPC eth_call request to Multicall3.
   * Batching 50 queries results in exactly 1 HTTP RPC request.
   */
  async execute<TCalls extends readonly Multicall3Call[]>(
    calls: TCalls,
    options: Multicall3Options = {}
  ): Promise<{ [K in keyof TCalls]: Multicall3CallResult }> {
    const targetAddress = options.multicallAddress || this.multicallAddress;
    const blockTag =
      options.blockNumber !== undefined
        ? typeof options.blockNumber === "number" || typeof options.blockNumber === "bigint"
          ? `0x${options.blockNumber.toString(16)}`
          : options.blockNumber
        : "latest";

    const allowFailure = options.allowFailure ?? this.defaultAllowFailure;
    const calldata = encodeAggregate3(calls as any, allowFailure);

    // Exactly 1 eth_call HTTP RPC request sent
    const returnDataHex = await this.rpcFetchFn("eth_call", [
      {
        to: targetAddress,
        data: calldata,
      },
      blockTag,
    ]);

    if (!returnDataHex || typeof returnDataHex !== "string") {
      throw new WhiteChainError("Invalid or empty response returned from eth_call Multicall3.");
    }

    const results = decodeAggregate3Results(returnDataHex as `0x${string}`, calls);
    return results as any;
  }
}

/**
 * Factory helper function to instantiate a Multicall instance.
 */
export function createMulticall(
  rpcFetchFn: RpcFetchFn,
  options?: Multicall3Options
): Multicall {
  return new Multicall(rpcFetchFn, options);
}
