import type { Address, Abi, Hash } from 'viem';

export type GasOptions = { multiplier?: number };

export type WithGasEstimation<TParams, TReturn = Hash> = {
  (params: TParams): Promise<TReturn>;
  estimateGas(params: TParams, options?: GasOptions): Promise<bigint>;
};

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
