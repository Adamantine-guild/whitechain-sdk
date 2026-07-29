import { http, createConfig } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';

// Define the Whitechain network if it's not in wagmi yet
export const whitechain = {
  id: 111, // Example ID, replace with actual
  name: 'Whitechain',
  nativeCurrency: { name: 'Whitechain', symbol: 'WHT', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.whitechain.io'] },
    public: { http: ['https://rpc.whitechain.io'] },
  },
} as const;

export const config = createConfig({
  chains: [mainnet, whitechain],
  transports: {
    [mainnet.id]: http(),
    [whitechain.id]: http(),
  },
});
