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

## 🔌 Plugin System

The SDK ships a first-class plugin architecture so community developers can extend the `WhitechainSDK` instance with custom namespaces — NFT marketplace helpers, lending calculators, analytics modules — without forking the core SDK or adding bloat to the core bundle.

### Core concepts

| Concept | Description |
|---|---|
| `WhitechainSDK` | The extensible host class. Accepts plugins at construction time or dynamically via `.use()`. |
| `ISDKPlugin` | Interface every plugin must implement: `name`, `version`, and `onInitialize(ctx)`. |
| `SDKContext` | Read-only view of SDK internals (`publicClient`, `walletClient`, `network`, `logger`) passed to `onInitialize`. |
| `WhitechainSDKPlugins` | Open interface for TypeScript declaration merging — augment it to add IDE autocomplete for your plugin's namespace. |

### Quick start

```ts
import { WhitechainSDK, type ISDKPlugin, type SDKContext } from 'whitechain-sdk'
import { networks } from 'whitechain-sdk'

// 1. Define a plugin
const marketplacePlugin: ISDKPlugin = {
  name: 'marketplace',
  version: '1.0.0',
  onInitialize(ctx: SDKContext) {
    return {
      async buyNFT(tokenId: bigint) {
        ctx.logger.info(`Purchasing NFT #${tokenId}`)
        // use ctx.publicClient / ctx.walletClient to call contracts
      },
    }
  },
}

// 2. Type-augment the SDK (in a .d.ts file or at the top of your plugin package)
declare module 'whitechain-sdk' {
  interface WhitechainSDKPlugins {
    marketplace: { buyNFT(tokenId: bigint): Promise<void> }
  }
}

// 3. Create the SDK — plugins are awaited before the factory resolves
const sdk = await WhitechainSDK.create(
  { network: networks.whitechainMainnet },
  [marketplacePlugin],
)

// 4. Call the plugin — fully typed, IDE autocomplete included
await sdk.marketplace.buyNFT(42n)
```

### Passing plugins at construction vs. dynamically

```ts
// At construction time (recommended)
const sdk = await WhitechainSDK.create(config, [pluginA, pluginB])

// Dynamically after construction
await sdk.use(pluginC)

// Chainable
await sdk.use(pluginD).then(s => s.use(pluginE))
```

### Accessing SDK internals from a plugin

`onInitialize` receives a frozen `SDKContext` object — the only surface plugins should interact with:

```ts
const myPlugin: ISDKPlugin = {
  name: 'myPlugin',
  version: '0.1.0',
  onInitialize({ publicClient, walletClient, network, logger }) {
    logger.info(`Plugin loaded on chain ${network?.chainId}`)
    return {
      getBalance: (addr: `0x${string}`) =>
        publicClient.getBalance({ address: addr }),
    }
  },
}
```

| Field | Type | Notes |
|---|---|---|
| `publicClient` | `PublicClient` | Always present. Use for reads and `eth_call`. |
| `walletClient` | `WalletClient \| undefined` | Present only when an `account` was provided to the SDK. |
| `network` | `NetworkProfile \| undefined` | Chain name, RPC URL, explorer URL, etc. |
| `logger` | `SDKLogger` | Structured logger — `info`, `warn`, `error`, `debug`. |

### Async initialization

Plugins may perform async work (fetch on-chain config, resolve ENS, etc.) in `onInitialize`. Use `WhitechainSDK.create()` to ensure all hooks are fully settled before the instance is returned:

```ts
const heavyPlugin: ISDKPlugin = {
  name: 'heavy',
  version: '1.0.0',
  async onInitialize(ctx) {
    const config = await ctx.publicClient.readContract({ /* ... */ })
    return { config }
  },
}

const sdk = await WhitechainSDK.create(config, [heavyPlugin])
// sdk.heavy.config is ready here — no race conditions
```

### Inspecting loaded plugins

```ts
console.log(sdk.getPlugins())
// [ { name: 'marketplace', version: '1.0.0' }, ... ]
```

### Plugin authoring guide

1. Export an object (or class instance) that satisfies `ISDKPlugin`.
2. Choose a unique `name` — it becomes the property key on the SDK instance. Avoid collisions with `publicClient`, `walletClient`, `network`, `logger`, `use`, and `getPlugins`.
3. Augment `WhitechainSDKPlugins` in your package's `index.d.ts` so consumers get full IDE support.
4. Keep the plugin self-contained. Do not import SDK internals directly — only use what `SDKContext` exposes.
5. The core bundle is **not affected** by external plugins; plugins are loaded lazily at runtime and contribute zero bytes to the base bundle.

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
