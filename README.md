# GrantChain SDK (MVP)

Minimal TypeScript SDK that wraps the MVP contract actions and simple reads using viem. Keep it small, typed, and future-friendly without overengineering.

## Install

```bash
npm i grantchain-sdk viem
```

## Quick Start

```ts
import { createGrantChainClient } from 'grantchain-sdk'
import { http } from 'viem'
import { mainnet } from 'viem/chains'
import type { Abi, Address } from 'viem'

const client = createGrantChainClient({
  chain: mainnet,
  transport: http('https://rpc.your.network'),
  addresses: { grant: '0xGrantContract' as Address },
  abis: { grant: /* your ABI */ {} as Abi },
  // account: yourAccount, // required for writes
})

// read
const round = await client.getGrantRound(1n)

// write (requires account and ABI)
await client.submitApplication({ grantId: 1n, applicant: '0x...', metadataUri: 'ipfs://...' })
```

## Supported Methods

- createGrantChainClient
- submitApplication
- approveApplication
- submitMilestoneEvidence
- approveMilestone
- releasePayout
- getGrantRound
- getGrantApplication
- getMilestones

## Omitted By Design

- extensive query abstractions
- advanced metadata tooling
- governance adapters
- plugin systems
- broad chain support
- complex caching layers
- large helper libraries
- generated docs site
- exhaustive utility abstractions

## Extending the SDK

- Keep the public API small and typed.
- Add new actions/reads near the existing ones in `src/client.ts`.
- Reuse existing patterns: clean parameter objects, simple error messages.
- When adding future features (voting, delegation, analytics, reputation), place TODOs first and avoid premature abstraction.

## Development

Scripts:

- `npm run build` – typecheck and emit ESM to `dist/`
- `npm run typecheck` – typecheck only
- `npm run test` – runs basic unit tests

## Notes

- The SDK expects the Grant contract address in config and the corresponding ABI for writes and typed reads.
- Clean, user-facing errors are thrown if required pieces are missing (e.g., ABI or wallet for writes).

## Contributing

We welcome contributions through GrantFox! See [CONTRIBUTING.md](CONTRIBUTING.md) for details on:
- How to claim issues via GrantFox
- Development setup and testing
- Pull request process
- Code style guidelines

## GrantFox

This repository is part of the Adamantine Guild project and participates in GrantFox for open-source collaboration. Contributors can:
- Browse and claim issues via [GrantFox Contributor App](https://contribute.grantfox.xyz/)
- Follow contribution guidelines in [CONTRIBUTING.md](CONTRIBUTING.md)
- Track PR reviews and campaign participation

Maintainers manage campaigns and review contributions via the [GrantFox Maintainer App](https://maintainer.grantfox.xyz/).

## License

MIT - see [LICENSE](LICENSE) file for details.

## Security

For security concerns, please see [SECURITY.md](SECURITY.md).

