export type RpcFetchFn = (method: string, params: any[]) => Promise<any>;

export interface ABILoaderOptions {
  explorerApiKey?: string;
  baseUrl?: string;
}

export class ABILoader {
  private fetchFn: RpcFetchFn;
  private cache = new Map<string, any[]>();
  private EIP1967_IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

  constructor(fetchFn: RpcFetchFn) {
    this.fetchFn = fetchFn;
  }

  /**
   * Reads the EIP-1967 implementation slot to check if the contract is a proxy.
   * If it is, returns the implementation address. Otherwise, returns the original address.
   */
  async resolveImplementation(address: string): Promise<string> {
    try {
      const slotData = await this.fetchFn('eth_getStorageAt', [address, this.EIP1967_IMPLEMENTATION_SLOT, 'latest']);
      if (slotData && slotData !== '0x' && slotData !== '0x0' && slotData !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        // Extract the address from the 32-byte word (last 20 bytes)
        const implAddress = '0x' + slotData.slice(-40);
        return implAddress;
      }
    } catch (err) {
      // Ignore errors (contract might not exist or RPC doesn't support it)
    }
    return address;
  }

  /**
   * Fetches the ABI from a supported block explorer.
   */
  async loadContract(address: string, opts?: ABILoaderOptions): Promise<any[]> {
    const targetAddress = (await this.resolveImplementation(address)).toLowerCase();

    if (this.cache.has(targetAddress)) {
      return this.cache.get(targetAddress)!;
    }

    const baseUrl = opts?.baseUrl ?? 'https://api.etherscan.io/api';
    let url = `${baseUrl}?module=contract&action=getabi&address=${targetAddress}`;
    if (opts?.explorerApiKey) {
      url += `&apikey=${opts.explorerApiKey}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ABI from explorer: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.status === '0' || !data.result) {
      throw new Error(`Contract unverified or ABI not found: ${data.result}`);
    }

    let abi: any[];
    try {
      abi = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    } catch (e) {
      throw new Error('Failed to parse ABI JSON');
    }

    this.cache.set(targetAddress, abi);
    return abi;
  }
}
