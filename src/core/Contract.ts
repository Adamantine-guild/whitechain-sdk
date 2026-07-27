import type { Abi, Address, PublicClient } from 'viem'
import { WhiteChainError } from '../types.js'

/**
 * Interface representing clients or providers capable of making eth_getCode queries.
 */
export type ContractClient =
  | PublicClient
  | {
      getCode?: (args: { address: Address }) => Promise<string | undefined>
      request?: (args: { method: string; params: unknown[] }) => Promise<unknown>
      publicClient?: PublicClient
    }

/**
 * Representation of a deployed smart contract bound to an address, ABI, and provider/client.
 */
export class Contract {
  public readonly address: Address
  public readonly abi: Abi
  public readonly client: ContractClient

  constructor(address: Address, abi: Abi, client: ContractClient) {
    if (!address) {
      throw new WhiteChainError('Contract address is required')
    }
    this.address = address
    this.abi = abi
    this.client = client
  }

  /**
   * Explicitly checks if contract bytecode exists at the configured address by calling `eth_getCode`.
   *
   * @throws {WhiteChainError} if no bytecode exists at the address (returns '0x' or empty).
   * @returns {Promise<this>} Resolves to `this` instance for method chaining if contract code exists.
   */
  async verify(): Promise<this> {
    let code: string | undefined

    const clientAny = this.client as any

    if (typeof clientAny?.getCode === 'function') {
      code = await clientAny.getCode({ address: this.address })
    } else if (typeof clientAny?.request === 'function') {
      const res = await clientAny.request({
        method: 'eth_getCode',
        params: [this.address, 'latest'],
      })
      code = typeof res === 'string' ? res : undefined
    } else if (typeof clientAny?.publicClient?.getCode === 'function') {
      code = await clientAny.publicClient.getCode({ address: this.address })
    } else {
      throw new WhiteChainError('Client or provider does not support getCode or eth_getCode')
    }

    if (!code || code === '0x' || code === '0x0') {
      throw new WhiteChainError(`No contract code deployed at address ${this.address} (code is '${code ?? '0x'}')`)
    }

    return this
import type { Address, PublicClient, WalletClient, Hash } from 'viem'
import type { Abi, ExtractAbiFunctionNames, ExtractAbiFunction, AbiParametersToPrimitiveTypes, AbiStateMutability } from 'abitype'
import { ValidationError } from '../errors/index.js'

type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

// Helper to extract argument types for a given ABI function
type ExtractArgs<
  TAbi extends Abi,
  TFunctionName extends string,
  TStateMutability extends AbiStateMutability
> = AbiParametersToPrimitiveTypes<
  ExtractAbiFunction<TAbi, TFunctionName, TStateMutability>['inputs']
> extends infer TArgs
  ? TArgs extends readonly []
    ? { args?: undefined }
    : { args: TArgs }
  : never

// Helper to extract return type for a given ABI function
type ExtractReturnType<
  TAbi extends Abi,
  TFunctionName extends string,
  TStateMutability extends AbiStateMutability
> = AbiParametersToPrimitiveTypes<
  ExtractAbiFunction<TAbi, TFunctionName, TStateMutability>['outputs']
> extends infer TOutputs
  ? TOutputs extends readonly []
    ? void
    : TOutputs extends readonly [infer TOnly]
    ? TOnly
    : TOutputs
  : never

export class Contract<
  TAbi extends Abi | readonly unknown[] = Abi,
> {
  constructor(
    public readonly address: Address,
    public readonly abi: TAbi,
    public readonly publicClient?: PublicClient,
    public readonly walletClient?: WalletClient,
  ) {}

  /**
   * Strongly typed wrapper for publicClient.readContract
   */
  async read<
    TFunctionName extends ExtractAbiFunctionNames<TAbi extends Abi ? TAbi : Abi, 'pure' | 'view'>,
    TArgs extends ExtractArgs<TAbi extends Abi ? TAbi : Abi, TFunctionName, 'pure' | 'view'>['args']
  >(
    functionName: TFunctionName,
    ...args: TArgs extends undefined ? [] : [args: TArgs]
  ): Promise<ExtractReturnType<TAbi extends Abi ? TAbi : Abi, TFunctionName, 'pure' | 'view'>> {
    if (!this.publicClient) {
      throw new ValidationError('PublicClient is not initialized for read operations')
      throw new Error('PublicClient is not initialized for read operations')
    }

    const _args = args.length > 0 ? (args[0] as unknown[]) : []

    return (this.publicClient as any).readContract({
      address: this.address,
      abi: this.abi,
      functionName,
      args: _args,
    })
  }

  /**
   * Strongly typed wrapper for walletClient.writeContract
   */
  async write<
    TFunctionName extends ExtractAbiFunctionNames<TAbi extends Abi ? TAbi : Abi, 'nonpayable' | 'payable'>,
    TArgs extends ExtractArgs<TAbi extends Abi ? TAbi : Abi, TFunctionName, 'nonpayable' | 'payable'>['args']
  >(
    functionName: TFunctionName,
    ...args: TArgs extends undefined ? [] : [args: TArgs]
  ): Promise<Hash> {
    if (!this.walletClient) {
      throw new ValidationError('WalletClient is not initialized for write operations')
      throw new Error('WalletClient is not initialized for write operations')
    }

    const _args = args.length > 0 ? (args[0] as unknown[]) : []

    return (this.walletClient as any).writeContract({
      address: this.address,
      abi: this.abi,
      functionName,
      args: _args,
    })
  }
}
