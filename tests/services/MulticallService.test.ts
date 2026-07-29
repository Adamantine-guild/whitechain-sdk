import { describe, expect, it, vi } from 'vitest'
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  parseAbi,
  type Address,
} from 'viem'
import {
  MULTICALL3_ADDRESS,
  MulticallService,
  getMulticall3Address,
  multicall3Abi,
} from '../../src/services/MulticallService.js'

const tokenAbi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function symbol() view returns (string)',
])
const token = '0x1111111111111111111111111111111111111111' as Address
const account = '0x2222222222222222222222222222222222222222' as Address

describe('MulticallService', () => {
  it('batches contract reads into one eth_call and decodes each result', async () => {
    const response = encodeFunctionResult({
      abi: multicall3Abi,
      functionName: 'aggregate3',
      result: [
        [true, encodeAbiParameters([{ type: 'uint256' }], [125n])],
        [true, encodeAbiParameters([{ type: 'string' }], ['WBT'])],
      ],
    })
    const request = vi.fn().mockResolvedValue(response)
    const service = new MulticallService({ request, chain: { id: 1875 } } as any)

    const results = await service.execute([
      { target: token, abi: tokenAbi, functionName: 'balanceOf', args: [account] },
      { target: token, abi: tokenAbi, functionName: 'symbol' },
    ] as const)

    expect(request).toHaveBeenCalledTimes(1)
    expect(results).toEqual([
      { status: 'success', result: 125n },
      { status: 'success', result: 'WBT' },
    ])

    const rpcRequest = request.mock.calls[0][0]
    expect(rpcRequest.method).toBe('eth_call')
    expect(rpcRequest.params[0].to).toBe(MULTICALL3_ADDRESS)

    const encodedBatch = decodeFunctionData({
      abi: multicall3Abi,
      data: rpcRequest.params[0].data,
    })
    expect(encodedBatch.functionName).toBe('aggregate3')
    expect((encodedBatch.args?.[0] as readonly unknown[])).toHaveLength(2)
  })

  it('returns failed calls when partial failures are allowed', async () => {
    const revertData = '0x08c379a0' as const
    const response = encodeFunctionResult({
      abi: multicall3Abi,
      functionName: 'aggregate3',
      result: [
        [true, encodeAbiParameters([{ type: 'uint256' }], [10n])],
        [false, revertData],
      ],
    })
    const request = vi.fn().mockResolvedValue(response)
    const service = new MulticallService({ request, chain: { id: 1 } } as any)

    const results = await service.execute([
      { target: token, abi: tokenAbi, functionName: 'balanceOf', args: [account] },
      { target: token, abi: tokenAbi, functionName: 'symbol' },
    ] as const)

    expect(results).toEqual([
      { status: 'success', result: 10n },
      { status: 'failure', error: revertData },
    ])
  })

  it('uses per-call allowFailure values when encoding the batch', async () => {
    const response = encodeFunctionResult({
      abi: multicall3Abi,
      functionName: 'aggregate3',
      result: [[true, encodeAbiParameters([{ type: 'string' }], ['WBT'])]],
    })
    const request = vi.fn().mockResolvedValue(response)
    const service = new MulticallService({ request, chain: { id: 2625 } } as any)

    await service.execute([
      { target: token, abi: tokenAbi, functionName: 'symbol', allowFailure: false },
    ] as const)

    const { args } = decodeFunctionData({
      abi: multicall3Abi,
      data: request.mock.calls[0][0].params[0].data,
    })
    expect((args?.[0] as readonly { allowFailure: boolean }[])[0].allowFailure).toBe(false)
  })

  it('resolves configured chains and supports custom deployments', () => {
    expect(getMulticall3Address(11155111)).toBe(MULTICALL3_ADDRESS)
    expect(() => getMulticall3Address(999)).toThrow('Multicall3 is not configured for chain 999')

    const customAddress = '0x3333333333333333333333333333333333333333' as Address
    const service = new MulticallService({ request: vi.fn() } as any, {
      multicallAddress: customAddress,
    })
    expect(service.address).toBe(customAddress)
  })

  it('returns an empty tuple without making an RPC request', async () => {
    const request = vi.fn()
    const service = new MulticallService({ request, chain: { id: 1 } } as any)

    await expect(service.execute([])).resolves.toEqual([])
    expect(request).not.toHaveBeenCalled()
  })
})
