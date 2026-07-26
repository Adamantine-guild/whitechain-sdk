import { createGrantChainClient } from '../src';
import { http } from 'viem';
import { mainnet } from 'viem/chains';
async function main() {
    const GRANT_ADDRESS = '0x000000000000000000000000000000000000dEaD';
    const RPC_URL = 'https://rpc.ankr.com/eth'; // replace with your network
    const grantAbi = []; // provide the real ABI here
    const client = createGrantChainClient({
        chain: mainnet,
        transport: http(RPC_URL),
        addresses: { grant: GRANT_ADDRESS },
        abis: { grant: grantAbi },
        // account: yourAccount, // uncomment for writes
    });
    const round = await client.getGrantRound(1n);
    console.log('Round', round);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
