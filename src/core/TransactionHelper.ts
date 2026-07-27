export type RpcFetchFn = (method: string, params: any[]) => Promise<any>;

export interface EstimateGasOptions {
  /**
   * The multiplier buffer to apply to the raw gas estimate.
   * For example, 1.2 adds a 20% buffer.
   * Default is 1.2.
   */
  multiplier?: number;
}

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
