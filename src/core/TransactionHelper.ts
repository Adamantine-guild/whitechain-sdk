import type { Address, Abi, Hash } from 'viem';

// ---------------------------------------------------------------------------
// withGasEstimation — higher-order function for write methods
// ---------------------------------------------------------------------------

export type GasOptions = { multiplier?: number };

export type WithGasEstimation<TParams, TReturn = Hash> = {
  (params: TParams): Promise<TReturn>;
  estimateGas(params: TParams, options?: GasOptions): Promise<bigint>;
};

/**
 * Wraps a write function with an `estimateGas` method so callers can
 * preview the gas cost before submitting a transaction.
 *
 * @param fn - The underlying write function.
 * @param publicClient - Used for `estimateContractGas`.
 * @param address - The contract address.
 * @param abi - The contract ABI.
 * @param functionName - The function to estimate gas for.
 * @param argsMapper - Maps the params object to an args array.
 * @param defaultMultiplier - Gas buffer multiplier (default 1.2 = +20%).
 */
export function withGasEstimation<TParams>(
  fn: (params: TParams) => Promise<Hash>,
  publicClient: any,
  address: Address,
  abi: Abi,
  functionName: string,
  argsMapper: (params: TParams) => any[],
  defaultMultiplier: number = 1.2
): WithGasEstimation<TParams> {
  const wrapped = Object.assign(fn, {
    estimateGas: async (params: TParams, options?: GasOptions) => {
      const multiplier = options?.multiplier ?? defaultMultiplier;
      const baseGas = await (publicClient as any).estimateContractGas({
        address,
        abi,
        functionName,
        args: argsMapper(params),
      });
      // apply buffer (pad by multiplier)
      return (baseGas * BigInt(Math.floor(multiplier * 100))) / 100n;
    },
  });
  return wrapped;
}

// ---------------------------------------------------------------------------
// TransactionHelper — class-based gas estimation
// ---------------------------------------------------------------------------

export type RpcFetchFn = (method: string, params: any[]) => Promise<any>;

export interface EstimateGasOptions {
  /**
   * The multiplier buffer to apply to the raw gas estimate.
   * For example, 1.2 adds a 20% buffer.
   * Default is 1.2.
   */
  multiplier?: number;
}

/**
 * Utility class for estimating gas costs via a raw RPC fetch function.
 *
 * Use this when you have a bare `eth_estimateGas` RPC caller rather than
 * a viem `PublicClient`. For viem-based estimation, prefer
 * {@link withGasEstimation}.
 */
export class TransactionHelper {
  private fetchFn: RpcFetchFn;
  private defaultMultiplier = 1.2;

  constructor(fetchFn: RpcFetchFn) {
    this.fetchFn = fetchFn;
  }

  /**
   * Overrides the default global gas multiplier (1.2x).
   */
  setDefaultMultiplier(multiplier: number) {
    if (multiplier < 1.0) {
      throw new Error('Multiplier must be at least 1.0');
    }
    this.defaultMultiplier = multiplier;
  }

  /**
   * Calls eth_estimateGas and safely applies a scaling buffer.
   * Returns a BigInt representing the padded gas limit.
   */
  async estimateGas(transaction: Record<string, any>, options?: EstimateGasOptions): Promise<bigint> {
    const rawEstimateHex = await this.fetchFn('eth_estimateGas', [transaction, 'latest']);
    
   * Calls `eth_estimateGas` and safely applies a scaling buffer.
   * Returns a `BigInt` representing the padded gas limit.
   */
  async estimateGas(transaction: Record<string, any>, options?: EstimateGasOptions): Promise<bigint> {
    const rawEstimateHex = await this.fetchFn('eth_estimateGas', [transaction, 'latest']);

    if (!rawEstimateHex || typeof rawEstimateHex !== 'string' || !rawEstimateHex.startsWith('0x')) {
      throw new Error('Invalid response from eth_estimateGas');
    }

    const rawGas = BigInt(rawEstimateHex);
    const multiplier = options?.multiplier ?? this.defaultMultiplier;

    if (multiplier < 1.0) {
      throw new Error('Multiplier must be at least 1.0');
    }

    // Multiply the raw gas by the multiplier safely avoiding floating point issues.
    // e.g. rawGas * Math.ceil(1.2 * 100) / 100n
    const scaleFactor = 10_000;
    const scaledMultiplier = BigInt(Math.ceil(multiplier * scaleFactor));

    const paddedGas = (rawGas * scaledMultiplier) / BigInt(scaleFactor);

    return paddedGas;
  }
}
