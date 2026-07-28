import type { Address, Hex, PublicClient } from 'viem'
import type { MulticallCall, MulticallResult, MulticallOptions } from '../types/multicall.js'
import { WhiteChainError } from '../types.js'

/**
 * Standard Multicall3 contract address deployed on Whitechain and EVM networks.
 */
export const MULTICALL3_DEFAULT_ADDRESS: Address = '0xca11bde05977b3631167028862be2a173976ca11'

/**
 * Minimal Multicall3 ABI for aggregate3 execution.
 */
export const MULTICALL3_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'target', type: 'address' },
          { name: 'allowFailure', type: 'bool' },
          { name: 'callData', type: 'bytes' },
        ],
        name: 'calls',
        type: 'tuple[]',
      },
    ],
    name: 'aggregate3',
    outputs: [
      {
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
        name: 'returnData',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
] as const

export class Multicall {
  public readonly multicallAddress: Address
  private publicClient?: PublicClient

  constructor(options?: { publicClient?: PublicClient; multicallAddress?: Address }) {
    this.publicClient = options?.publicClient
    this.multicallAddress = options?.multicallAddress ?? MULTICALL3_DEFAULT_ADDRESS
  }

  /**
   * Batches multiple view calls into a single RPC eth_call request to Multicall3.
   *
   * @param calls Array of MulticallCall targets and callData payloads.
   * @param options Execution overrides (publicClient, multicallAddress, default allowFailure).
   * @returns Clean, typed array of MulticallResult matching the input calls.
   */
  public async aggregate<TCalls extends readonly MulticallCall[]>(
    calls: TCalls,
    options?: MulticallOptions
  ): Promise<{ [K in keyof TCalls]: MulticallResult<TCalls[K] extends MulticallCall<infer R> ? R : any> }> {
    if (!calls || calls.length === 0) {
      return [] as any
    }

    const client = options?.publicClient ?? this.publicClient
    if (!client) {
      throw new WhiteChainError('No publicClient provided for Multicall aggregate execution')
    }

    const multicallAddress = options?.multicallAddress ?? this.multicallAddress

    // Format calls into Multicall3 aggregate3 call tuples: [target, allowFailure, callData]
    const formattedCalls = calls.map((c) => ({
      target: c.target,
      allowFailure: c.allowFailure ?? options?.allowFailure ?? true,
      callData: c.callData,
    }))

    // Execute single eth_call to Multicall3 aggregate3
    const rawResults = (await (client as any).readContract({
      address: multicallAddress,
      abi: MULTICALL3_ABI,
      functionName: 'aggregate3',
      args: [formattedCalls],
    })) as Array<{ success: boolean; returnData: Hex }>

    // Process and decode each return tuple
    const results = rawResults.map((res, i) => {
      const call = calls[i]
      const success = res.success
      const returnData = res.returnData

      if (!success) {
        return {
          success: false,
          data: null,
          returnData,
          error: new WhiteChainError(`Multicall view function reverted at index ${i} (target: ${call.target})`),
        }
      }

      if (call.decoder) {
        try {
          const decodedData = call.decoder(returnData)
          return {
            success: true,
            data: decodedData,
            returnData,
          }
        } catch (err) {
          return {
            success: false,
            data: null,
            returnData,
            error: err instanceof Error ? err : new WhiteChainError(String(err)),
          }
        }
      }

      return {
        success: true,
        data: returnData,
        returnData,
      }
    })

    return results as any
  }
}

/**
 * Factory helper to construct a Multicall instance.
 */
export function createMulticall(options?: { publicClient?: PublicClient; multicallAddress?: Address }): Multicall {
  return new Multicall(options)
}
