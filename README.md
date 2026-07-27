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

## 🔐 Crypto (secp256k1)

`whitechain-sdk/crypto` exposes low-level secp256k1 signing, verification, and public-key recovery, backed by a WebAssembly implementation (`tiny-secp256k1`) with an automatic, transparent fallback to a pure-JavaScript implementation (`@noble/curves`) in environments where WASM can't be loaded. The active backend is chosen lazily on first use and cached for the life of the process.

```ts
import { sign, verify, getPublicKey } from 'whitechain-sdk/crypto'

const publicKey = await getPublicKey(privateKey)
const signature = await sign(messageHash, privateKey) // { r, s, recovery }
const isValid = await verify(messageHash, signature, publicKey)
```

Both backends produce identical, low-S-normalized, RFC6979-deterministic output for the same input — the WASM path is purely a performance optimization, never a behavioral change.

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
- `npm run bench` – Benchmark the WASM vs JS secp256k1 signer (requires `npm run build` first)

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
