import { describe, it, expect, vi } from 'vitest'
import {
  Multicall,
  createMulticall,
  MULTICALL3_DEFAULT_ADDRESS,
  MULTICALL3_ABI,
} from '../../src/core/Multicall.js'
import { WhiteChainError } from '../../src/types.js'
import type { Address, Hex } from 'viem'

const dummyTarget = '0x1111111111111111111111111111111111111111' as Address
const customMulticallAddress = '0x2222222222222222222222222222222222222222' as Address

describe('Multicall3 Batching', () => {
  it('batches 50 queries into exactly 1 HTTP RPC call', async () => {
    let readContractCallCount = 0
    let lastContractCallArgs: any = null

    // Mock publicClient that tracks call count
    const mockPublicClient = {
      readContract: vi.fn().mockImplementation(async (args: any) => {
        readContractCallCount++
        lastContractCallArgs = args
        // Return 50 successful mock responses
        return Array.from({ length: 50 }, (_, i) => ({
          success: true,
          returnData: `0x${(i + 1).toString(16).padStart(64, '0')}` as Hex,
        }))
      }),
    } as any

    const multicall = new Multicall({ publicClient: mockPublicClient })

    // Build 50 call objects
    const calls = Array.from({ length: 50 }, (_, i) => ({
      target: dummyTarget,
      callData: `0xabc${i}` as Hex,
      decoder: (bytes: Hex) => parseInt(bytes, 16),
    }))

    const results = await multicall.aggregate(calls)

    // Verify EXACTLY 1 RPC request was issued for 50 queries
    expect(readContractCallCount).toBe(1)
    expect(mockPublicClient.readContract).toHaveBeenCalledTimes(1)
    expect(lastContractCallArgs.address).toBe(MULTICALL3_DEFAULT_ADDRESS)
    expect(lastContractCallArgs.abi).toEqual(MULTICALL3_ABI)
    expect(lastContractCallArgs.functionName).toBe('aggregate3')
    expect(lastContractCallArgs.args[0].length).toBe(50)

    // Verify 50 results parsed correctly
    expect(results.length).toBe(50)
    expect(results[0]).toEqual({
      success: true,
      data: 1,
      returnData: '0x0000000000000000000000000000000000000000000000000000000000000001',
    })
    expect(results[49].data).toBe(50)
  })

  it('gracefully handles partial failures (reverts) with aggregate3 allowFailure', async () => {
    const mockPublicClient = {
      readContract: vi.fn().mockResolvedValue([
        { success: true, returnData: '0x000000000000000000000000000000000000000000000000000000000000000a' },
        { success: false, returnData: '0x' }, // Reverted call
        { success: true, returnData: '0x0000000000000000000000000000000000000000000000000000000000000014' },
      ]),
    } as any

    const multicall = createMulticall({ publicClient: mockPublicClient })

    const calls = [
      { target: dummyTarget, callData: '0x1111' as Hex, decoder: (hex: Hex) => parseInt(hex, 16) },
      { target: dummyTarget, callData: '0x2222' as Hex, allowFailure: true },
      { target: dummyTarget, callData: '0x3333' as Hex, decoder: (hex: Hex) => parseInt(hex, 16) },
    ]

    const results = await multicall.aggregate(calls)

    expect(results.length).toBe(3)
    // Successful call #1
    expect(results[0].success).toBe(true)
    expect(results[0].data).toBe(10)

    // Failed call #2 (reverted on-chain, but batch succeeded)
    expect(results[1].success).toBe(false)
    expect(results[1].data).toBe(null)
    expect(results[1].error).toBeInstanceOf(WhiteChainError)

    // Successful call #3
    expect(results[2].success).toBe(true)
    expect(results[2].data).toBe(20)
  })

  it('supports custom multicallAddress override', async () => {
    const mockPublicClient = {
      readContract: vi.fn().mockResolvedValue([
        { success: true, returnData: '0x1234' },
      ]),
    } as any

    const multicall = new Multicall({
      publicClient: mockPublicClient,
      multicallAddress: customMulticallAddress,
    })

    await multicall.aggregate([
      { target: dummyTarget, callData: '0x9999' as Hex },
    ])

    expect(mockPublicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: customMulticallAddress,
      })
    )
  })

  it('catches decoder errors and marks individual result as failed', async () => {
    const mockPublicClient = {
      readContract: vi.fn().mockResolvedValue([
        { success: true, returnData: '0xinvalid' },
      ]),
    } as any

    const multicall = new Multicall({ publicClient: mockPublicClient })

    const results = await multicall.aggregate([
      {
        target: dummyTarget,
        callData: '0x1234' as Hex,
        decoder: () => {
          throw new Error('Decoder failed to parse bytes')
        },
      },
    ])

    expect(results[0].success).toBe(false)
    expect(results[0].data).toBe(null)
    expect(results[0].error?.message).toBe('Decoder failed to parse bytes')
  })

  it('throws WhiteChainError if no publicClient is provided', async () => {
    const multicall = new Multicall()

    await expect(
      multicall.aggregate([{ target: dummyTarget, callData: '0x1234' as Hex }])
    ).rejects.toThrow(WhiteChainError)
  })

  it('returns empty array immediately if calls array is empty', async () => {
    const multicall = new Multicall()
    const results = await multicall.aggregate([])
    expect(results).toEqual([])
  })
})
