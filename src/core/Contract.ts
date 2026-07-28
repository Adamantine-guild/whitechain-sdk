import type { Address, PublicClient, WalletClient, Hash } from 'viem'
import type { Abi, ExtractAbiFunctionNames, ExtractAbiFunction, AbiParametersToPrimitiveTypes, AbiStateMutability } from 'abitype'
import { ValidationError } from '../errors/index.js'
import { parseContractError } from '../utils/errorHandler.js'
import { NetworkContext, NetworkObserver, NetworkState } from './NetworkContext.js'

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
> implements NetworkObserver {
  public publicClient?: PublicClient;
  public walletClient?: WalletClient;
  public address: Address;

  constructor(
    address: Address,
    public readonly abi: TAbi,
    publicClientOrContext?: PublicClient | NetworkContext,
    walletClient?: WalletClient,
    public readonly addressKey?: string
  ) {
    this.address = address;
    
    if (publicClientOrContext instanceof NetworkContext) {
      publicClientOrContext.subscribe(this);
    } else {
      this.publicClient = publicClientOrContext;
      this.walletClient = walletClient;
    }
  }

  onNetworkChanged(state: NetworkState) {
    this.publicClient = state.publicClient;
    this.walletClient = state.walletClient;
    if (this.addressKey && state.addresses[this.addressKey]) {
      this.address = state.addresses[this.addressKey];
    }
  }

  destroy(context: NetworkContext) {
    context.unsubscribe(this);
  }

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

    try {
      return await (this.publicClient as any).readContract({
        address: this.address,
        abi: this.abi,
        functionName,
        args: _args,
      })
    } catch (err) {
      throw parseContractError(err, this.abi as Abi)
    }
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

    try {
      return await (this.walletClient as any).writeContract({
        address: this.address,
        abi: this.abi,
        functionName,
        args: _args,
      })
    } catch (err) {
      throw parseContractError(err, this.abi as Abi)
    }
  }
}
