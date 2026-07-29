import {
  decodeFunctionResult,
  encodeFunctionData,
  type Abi,
  type Address,
  type BlockTag,
  type ContractFunctionName,
  type ContractFunctionReturnType,
  type Hex,
  type PublicClient,
} from 'viem'
import multicall3AbiJson from '../abis/Multicall3.json' with { type: 'json' }
import { WhiteChainError } from '../errors/index.js'

export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as Address

export const MULTICALL3_ADDRESSES = {
  1: MULTICALL3_ADDRESS,
  1875: MULTICALL3_ADDRESS,
  2625: MULTICALL3_ADDRESS,
  11155111: MULTICALL3_ADDRESS,
} as const satisfies Record<number, Address>

export const multicall3Abi = multicall3AbiJson as Abi

export interface MulticallRequest<
  TAbi extends Abi = Abi,
  TFunctionName extends ContractFunctionName<TAbi, 'pure' | 'view'> = ContractFunctionName<
    TAbi,
    'pure' | 'view'
  >,
> {
  target: Address
  abi: TAbi
  functionName: TFunctionName
  args?: readonly unknown[]
  allowFailure?: boolean
}

export type MulticallSuccess<TResult> = {
  status: 'success'
  result: TResult
}

export type MulticallFailure = {
  status: 'failure'
  error: Hex
}

type RequestResult<TRequest> = TRequest extends MulticallRequest<
  infer TAbi,
  infer TFunctionName
>
  ? ContractFunctionReturnType<TAbi, 'pure' | 'view', TFunctionName>
  : never

export type MulticallResult<TRequest> =
  | MulticallSuccess<RequestResult<TRequest>>
  | MulticallFailure

export type MulticallResults<TRequests extends readonly unknown[]> = {
  -readonly [TIndex in keyof TRequests]: MulticallResult<TRequests[TIndex]>
}

export interface MulticallServiceOptions {
  chainId?: number
  multicallAddress?: Address
  allowFailure?: boolean
}

export interface MulticallExecuteOptions {
  allowFailure?: boolean
  blockNumber?: bigint
  blockTag?: BlockTag
}

type Aggregate3Result = readonly {
  success: boolean
  returnData: Hex
}[]

export function getMulticall3Address(chainId: number): Address {
  const address = MULTICALL3_ADDRESSES[chainId as keyof typeof MULTICALL3_ADDRESSES]
  if (!address) {
    throw new WhiteChainError(
      `Multicall3 is not configured for chain ${chainId}. Pass multicallAddress to use a custom deployment.`,
    )
  }
  return address
}

export class MulticallService {
  public readonly address: Address
  public readonly defaultAllowFailure: boolean

  constructor(
    private readonly publicClient: PublicClient,
    options: MulticallServiceOptions = {},
  ) {
    const chainId = options.chainId ?? publicClient.chain?.id
    if (!options.multicallAddress && chainId === undefined) {
      throw new WhiteChainError(
        'A chainId or multicallAddress is required when the public client has no chain.',
      )
    }

    this.address = options.multicallAddress ?? getMulticall3Address(chainId as number)
    this.defaultAllowFailure = options.allowFailure ?? true
  }

  async execute<const TRequests extends readonly MulticallRequest<any, any>[]>(
    requests: TRequests,
    options: MulticallExecuteOptions = {},
  ): Promise<MulticallResults<TRequests>> {
    if (requests.length === 0) {
      return [] as unknown as MulticallResults<TRequests>
    }

    const defaultAllowFailure = options.allowFailure ?? this.defaultAllowFailure
    const calls = requests.map((request) => ({
      target: request.target,
      allowFailure: request.allowFailure ?? defaultAllowFailure,
      callData: encodeFunctionData({
        abi: request.abi,
        functionName: request.functionName,
        args: request.args,
      } as never),
    }))

    const data = encodeFunctionData({
      abi: multicall3Abi,
      functionName: 'aggregate3',
      args: [calls],
    })
    const block = options.blockNumber === undefined
      ? options.blockTag ?? 'latest'
      : `0x${options.blockNumber.toString(16)}`

    const response = await (this.publicClient as any).request({
      method: 'eth_call',
      params: [{ to: this.address, data }, block],
    }) as Hex

    const decoded = decodeFunctionResult({
      abi: multicall3Abi,
      functionName: 'aggregate3',
      data: response,
    }) as Aggregate3Result

    if (decoded.length !== requests.length) {
      throw new WhiteChainError(
        `Multicall3 returned ${decoded.length} results for ${requests.length} requests.`,
      )
    }

    return decoded.map((item, index) => {
      if (!item.success) {
        return { status: 'failure', error: item.returnData }
      }

      const request = requests[index]
      return {
        status: 'success',
        result: decodeFunctionResult({
          abi: request.abi,
          functionName: request.functionName,
          data: item.returnData,
        } as never),
      }
    }) as MulticallResults<TRequests>
  }
}
