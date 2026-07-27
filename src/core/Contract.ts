import type { Address, PublicClient, WalletClient, Hash } from 'viem'
import type { Abi, ExtractAbiFunctionNames, ExtractAbiFunction, AbiParametersToPrimitiveTypes, AbiStateMutability } from 'abitype'

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
