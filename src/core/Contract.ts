import type { Abi, Address, PublicClient } from 'viem'
import { WhiteChainError } from '../types.js'
import type { Address, PublicClient, WalletClient, Hash } from 'viem'
import type { Abi, ExtractAbiFunctionNames, ExtractAbiFunction, AbiParametersToPrimitiveTypes, AbiStateMutability } from 'abitype'
import { ValidationError } from '../errors/index.js'
import { parseContractError } from '../utils/errorHandler.js'

type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

import type { Abi, Address, PublicClient } from 'viem'
import { WhiteChainError } from '../types.js'
import type { Abi, Address, PublicClient, WalletClient, Hash } from 'viem'
import type { ExtractAbiFunctionNames, ExtractAbiFunction, AbiParametersToPrimitiveTypes, AbiStateMutability } from 'abitype'
import { WhiteChainError } from '../types.js'
import { ValidationError } from '../errors/index.js'

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
 * Representation of a deployed smart contract bound to an address, ABI, and optional clients.
 *
 * Provides:
 * - `verify()` — opt-in on-chain bytecode check
 * - `read()` — strongly typed view/pure call wrapper
 * - `write()` — strongly typed nonpayable/payable call wrapper
 */
export class Contract<
  TAbi extends Abi | readonly unknown[] = Abi,
> {
  /** The contract's deployed address. */
  public readonly address: Address
  /** The ABI describing the contract's interface. */
  public readonly abi: TAbi
  /**
   * Public client used for read operations and `verify()`.
   * @deprecated Pass `publicClient` as the third constructor argument.
   */
  public readonly client?: ContractClient
  /** Public client used for `read()`. */
  public readonly publicClient?: PublicClient
  /** Wallet client used for `write()`. */
  public readonly walletClient?: WalletClient

  /**
   * Creates a new `Contract` instance.
   *
   * Supports two calling conventions for backwards-compatibility:
   *
   * 1. **Legacy** (supports `verify()`):
   *    `new Contract(address, abi, contractClient)`
   *
   * 2. **Typed read/write**:
   *    `new Contract(address, abi, publicClient?, walletClient?)`
   */
  constructor(address: Address, abi: TAbi, publicClientOrContractClient?: PublicClient | ContractClient, walletClient?: WalletClient) {
    if (!address) {
      throw new WhiteChainError('Contract address is required')
    }
    this.address = address
    this.abi = abi
    this.client = client
    // Support both calling conventions
    if (publicClientOrContractClient !== undefined) {
      // If a ContractClient-style object (no `request` matching PublicClient signature, or has `getCode`)
      const maybeContractClient = publicClientOrContractClient as any
      if (
        typeof maybeContractClient?.getCode === 'function' ||
        (typeof maybeContractClient?.request === 'function' && !walletClient) ||
        maybeContractClient?.publicClient !== undefined
      ) {
        this.client = publicClientOrContractClient as ContractClient
        this.publicClient = (maybeContractClient?.publicClient ?? maybeContractClient) as PublicClient | undefined
      } else {
        this.publicClient = publicClientOrContractClient as PublicClient
        this.client = this.publicClient as ContractClient
      }
    }
    this.walletClient = walletClient
  }

  /**
   * Explicitly checks if contract bytecode exists at the configured address by calling `eth_getCode`.
   *
   * @throws {WhiteChainError} if no bytecode exists at the address (returns '0x' or empty).
   * @returns {Promise<this>} Resolves to `this` instance for method chaining if contract code exists.
   * @returns {Promise<this>} Resolves to `this` for method chaining if contract code exists.
   */
  async verify(): Promise<this> {
    let code: string | undefined

    const clientAny = this.client as any
    const clientAny = (this.client ?? this.publicClient) as any

    if (!clientAny) {
      throw new WhiteChainError('Client or provider does not support getCode or eth_getCode')
    }

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
  }

  /**
   * Strongly typed wrapper for `publicClient.readContract`.
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
   * Strongly typed wrapper for `walletClient.writeContract`.
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
