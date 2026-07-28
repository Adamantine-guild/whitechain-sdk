<div align="center">
  <h1>WhiteChain SDK</h1>
  <p>
    <strong>A streamlined TypeScript SDK to interact with WhiteChain smart contracts.</strong>
  </p>
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
</div>

## 🌟 Overview

The WhiteChain SDK provides a minimal, typed, and future-friendly wrapper around WhiteChain contract actions and reads. Built on top of `viem`, it's designed to be lightweight and highly extensible.

## 📦 Installation

```bash
npm install whitechain-sdk viem
```

## 🚀 Quick Start

Initialize the client and start interacting with the network:

```ts
import { createWhiteChainClient } from 'whitechain-sdk'
import { http } from 'viem'
import { mainnet } from 'viem/chains'
import type { Abi, Address } from 'viem'

const client = createWhiteChainClient({
  chain: mainnet,
  transport: http('https://rpc.your.network'),
  addresses: { grant: '0xGrantContract' as Address },
  abis: { grant: /* your ABI */ {} as Abi },
  // account: yourAccount, // required for writes
})

// Read Operations
const round = await client.getGrantRound(1n)

// Write Operations (Requires account & ABI)
await client.submitApplication({ 
  grantId: 1n, 
  applicant: '0x...', 
  metadataUri: 'ipfs://...' 
})
```

## 🛠️ Supported Methods

- `createWhiteChainClient`
- `submitApplication`
- `approveApplication`
- `submitMilestoneEvidence`
- `approveMilestone`
- `releasePayout`
- `getGrantRound`
- `getGrantApplication`
- `getMilestones`

## 🏗️ Design Philosophy

**Omitted By Design** to keep the SDK fast and secure:
- Extensive query abstractions
- Advanced metadata tooling
- Broad chain support (focused strictly on WhiteChain)
- Complex caching layers
- Large helper libraries

**Extending the SDK**:
- Keep the public API small and strongly typed.
- Add new actions/reads near the existing ones in `src/client.ts`.
- Reuse existing patterns: clean parameter objects, simple error messages.

## 💻 Development

Available scripts for local development:

- `npm run build` – Typecheck and emit ESM to `dist/`
- `npm run typecheck` – Typecheck only
- `npm run test` – Run unit tests via Vitest

### 🧪 Foundry Invariant & Stateful Fuzzing Suite

We utilize [Foundry](https://book.getfoundry.sh/) to perform deep stateful invariant testing on core AMM and Vault smart contracts. The fuzzing suite bombards contracts with random input sequences to ensure critical economic invariants hold true unconditionally across state space transitions.

To run the invariant test suite:

```bash
forge test --match-path "test/invariants/*"
```

#### Key Invariants Tested

- **Constant Product Formula (`x * y >= k`)**: Proves that AMM swaps (including 0.3% fee accrual) never decrease total pool constant $k$.
- **Vault Asset Solvency (`totalShares <= totalAssets`)**: Ensures share minting never exceeds underlying asset reserves.
- **User Balance Boundary (`userBalance <= totalSupply`)**: Verifies no single user's LP or Vault share balance exceeds overall contract total supply.
- **Graceful Revert Handling**: Ensures zero-amount swap attempts and invalid inputs revert gracefully without breaking stateful fuzz runs.

#### Configuration (`foundry.toml`)

- **Runs**: 10,000 random input sequences per invariant.
- **Depth**: 500 call transitions per run.
- **Revert Policy**: `fail_on_revert = false` (handled via stateful `Handler.sol`).

## 🤝 Contributing

We strongly believe in open-source and welcome contributions from the community!

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'Add some amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

Please review our [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

### GrantFox Platform

This repository participates in **GrantFox** for open-source collaboration. Contributors can:
- Browse and claim issues via the [GrantFox Contributor App](https://contribute.grantfox.xyz/)
- Track PR reviews and campaign participation.

Maintainers manage campaigns and review contributions via the [GrantFox Maintainer App](https://maintainer.grantfox.xyz/).

## 🛡️ Security

For security policies and vulnerability reporting, please refer to [SECURITY.md](SECURITY.md).

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
