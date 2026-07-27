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
  }
}
