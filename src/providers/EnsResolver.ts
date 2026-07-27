import { encodeFunctionData, decodeFunctionResult, toBytes, toHex } from 'viem';

const UNIVERSAL_RESOLVER_ADDRESS = '0xc0497E381f536Be9ce14B0dD3817cBcAe57d2F62';

const universalResolverAbi = [
  {
    inputs: [{ internalType: 'bytes', name: 'reverseName', type: 'bytes' }],
    name: 'reverse',
    outputs: [
      { internalType: 'string', name: 'resolvedName', type: 'string' },
      { internalType: 'address', name: 'resolvedAddress', type: 'address' },
      { internalType: 'address', name: 'reverseResolver', type: 'address' },
      { internalType: 'address', name: 'resolver', type: 'address' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export type RpcFetchFn = (method: string, params: any[]) => Promise<any>;

interface CacheEntry {
  name: string | null;
  expiresAt: number;
}

export class EnsResolver {
  private cache = new Map<string, CacheEntry>();
  private cacheTtlMs = 60_000; // 60 seconds
  private fetchFn: RpcFetchFn;

  constructor(fetchFn: RpcFetchFn) {
    this.fetchFn = fetchFn;
  }

  /**
   * Looks up the ENS name for a given Ethereum address using the Mainnet Universal Resolver.
   * Caches the result briefly to prevent spam.
   * Returns null if no record exists.
   */
  async lookupAddress(address: string): Promise<string | null> {
    const normalizedAddress = address.toLowerCase();

    const cached = this.cache.get(normalizedAddress);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.name;
    }

    try {
      // 1. Format the reverse name: <address without 0x>.addr.reverse
      const addressWithoutPrefix = normalizedAddress.replace('0x', '');
      const reverseName = `${addressWithoutPrefix}.addr.reverse`;
      
      // 2. DNS encode the name for the Universal Resolver
      const encodedName = this.encodeDnsName(reverseName);

      const data = encodeFunctionData({
        abi: universalResolverAbi,
        functionName: 'reverse',
        args: [encodedName],
      });

      // 3. Make the eth_call to the Universal Resolver
      const result = await this.fetchFn('eth_call', [
        {
          to: UNIVERSAL_RESOLVER_ADDRESS,
          data,
        },
        'latest',
      ]);

      if (!result || result === '0x') {
        this.setCache(normalizedAddress, null);
        return null;
      }

      // 4. Decode the result
      const decoded = decodeFunctionResult({
        abi: universalResolverAbi,
        functionName: 'reverse',
        data: result,
      });

      const name = decoded[0] as string;

      // Ensure the name is valid (ENS returns empty string if no record)
      const finalName = name && name.length > 0 ? name : null;
      
      this.setCache(normalizedAddress, finalName);
      return finalName;
    } catch (error) {
      // On error (e.g., contract revert), assume no record exists and cache it to prevent spam retry.
      this.setCache(normalizedAddress, null);
      return null;
    }
  }

  private setCache(address: string, name: string | null) {
    this.cache.set(address, {
      name,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  /**
   * DNS encodes a string name, e.g. "foo.eth" -> "\x03foo\x03eth\x00"
   */
  private encodeDnsName(name: string): `0x${string}` {
    const parts = name.split('.');
    let length = 1; // for the null byte
    for (const part of parts) {
      length += 1 + toBytes(part).length;
    }
    
    const bytes = new Uint8Array(length);
    let offset = 0;
    
    for (const part of parts) {
      const partBytes = toBytes(part);
      bytes[offset++] = partBytes.length;
      bytes.set(partBytes, offset);
      offset += partBytes.length;
    }
    
    bytes[offset] = 0;
    return toHex(bytes);
  }
}
