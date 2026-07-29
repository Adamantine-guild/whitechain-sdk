import { encodeFunctionData, decodeFunctionResult } from 'viem';
import { ABILoader, RpcFetchFn, ABILoaderOptions } from '../services/ABILoader.js';

export class DynamicContract {
  private address: string;
  private fetchFn: RpcFetchFn;
  private abi: any[];

  private constructor(address: string, fetchFn: RpcFetchFn, abi: any[]) {
    this.address = address;
    this.fetchFn = fetchFn;
    this.abi = abi;
  }

  /**
   * Instantiates a dynamic contract by strictly providing its address.
   * Resolves proxy implementations and fetches the uncompiled ABI on-the-fly.
   */
  static async create(address: string, fetchFn: RpcFetchFn, opts?: ABILoaderOptions): Promise<any> {
    const loader = new ABILoader(fetchFn);
    const abi = await loader.loadContract(address, opts);
    
    const contract = new DynamicContract(address, fetchFn, abi);
    return contract.createProxy();
  }

  /**
   * Internal proxy creation that intercepts dynamic method calls.
   */
  private createProxy(): any {
    return new Proxy(this, {
      get: (target, prop: string) => {
        // If they ask for a native property of the class, return it.
        if (prop in target) {
          return (target as any)[prop];
        }

        // Check if the property corresponds to a function in the ABI.
        const abiItem = target.abi.find((item: any) => item.type === 'function' && item.name === prop);
        
        if (!abiItem) {
          return undefined;
        }

        // Return an async function wrapper that encodes and calls the method dynamically.
        return async (...args: any[]) => {
          const data = encodeFunctionData({
            abi: target.abi,
            functionName: prop,
            args,
          });

          // Determine if it's a read (view/pure) or a write (nonpayable/payable)
          const isView = abiItem.stateMutability === 'view' || abiItem.stateMutability === 'pure';

          if (isView) {
            const result = await target.fetchFn('eth_call', [
              { to: target.address, data },
              'latest',
            ]);

            const decoded = decodeFunctionResult({
              abi: target.abi,
              functionName: prop,
              data: result,
            });

            return decoded;
          } else {
            // For state-changing transactions, we return an eth_sendTransaction call
            // Usually requires signing, so in a real SDK, we'd pass it to a signer.
            // But standard RPC allows eth_sendTransaction if node has unlocked accounts.
            const result = await target.fetchFn('eth_sendTransaction', [
              { to: target.address, data },
            ]);
            return result;
          }
        };
      },
    });
  }
}
