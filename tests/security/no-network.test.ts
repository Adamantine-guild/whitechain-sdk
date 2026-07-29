import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { signOfflineTransaction, OfflineSigner } from '../../src/security/OfflineSigner.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const securitySrcDir = join(repoRoot, 'src', 'security')

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return listTsFiles(full)
    return entry.name.endsWith('.ts') ? [full] : []
  })
}

/**
 * Strips block and line comments so the forbidden-symbol scan only matches
 * actual code — this module's own JSDoc intentionally *names* the RPC
 * methods it must never call, which would otherwise self-trigger the check.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const FORBIDDEN_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'fetch(', pattern: /\bfetch\s*\(/ },
  { name: 'http(', pattern: /\bhttp\s*\(/ },
  { name: 'webSocket(', pattern: /\bwebSocket\s*\(/ },
  { name: 'WebSocket', pattern: /\bnew WebSocket\b/ },
  { name: 'XMLHttpRequest', pattern: /XMLHttpRequest/ },
  { name: 'createPublicClient', pattern: /createPublicClient/ },
  { name: 'createWalletClient', pattern: /createWalletClient/ },
  { name: 'createTransport', pattern: /createTransport/ },
  { name: 'getNetwork(', pattern: /getNetwork\s*\(/ },
  { name: 'getChainId(', pattern: /getChainId\s*\(/ },
  { name: 'getTransactionCount(', pattern: /getTransactionCount\s*\(/ },
  { name: 'estimateGas(', pattern: /estimateGas\s*\(/ },
  { name: 'getGasPrice(', pattern: /getGasPrice\s*\(/ },
  { name: 'estimateFeesPerGas(', pattern: /estimateFeesPerGas\s*\(/ },
  { name: 'prepareTransactionRequest', pattern: /prepareTransactionRequest/ },
  { name: 'node:http(s) import', pattern: /from ['"]node:https?['"]/ },
]

/**
 * Issue #65: "Develop Offline Transaction Signing Utility for Cold Storage".
 * OfflineSigner must construct and sign transactions in a fully air-gapped
 * environment — these checks fail loudly if any RPC/network primitive is
 * ever introduced into src/security, rather than relying on review to catch it.
 */
describe('OfflineSigner has no network operations (air-gapped guarantee)', () => {
  it('never references RPC/network/auto-fetch symbols in src/security', () => {
    const files = listTsFiles(securitySrcDir)
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const code = stripComments(readFileSync(file, 'utf-8'))
      for (const { name, pattern } of FORBIDDEN_PATTERNS) {
        expect(code, `${file} should not reference "${name}" in code`).not.toMatch(pattern)
      }
    }
  })

  it('never imports a provider/transport/client/network module', () => {
    const files = listTsFiles(securitySrcDir)
    for (const file of files) {
      const content = readFileSync(file, 'utf-8')
      expect(content, `${file} should not import a network provider`).not.toMatch(
        /from ['"].*\/(providers|network)\//,
      )
    }
  })

  it('never imports axios or another HTTP client dependency', () => {
    const files = listTsFiles(securitySrcDir)
    for (const file of files) {
      const content = readFileSync(file, 'utf-8')
      expect(content, `${file} should not import an HTTP client`).not.toMatch(
        /from ['"](axios|node-fetch|undici|ethers)['"]/,
      )
    }
  })
})

const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const RECIPIENT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

describe('OfflineSigner never performs network I/O at runtime', () => {
  const originalFetch = globalThis.fetch
  const originalWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket
  const originalXHR = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest

  afterEach(() => {
    globalThis.fetch = originalFetch
    ;(globalThis as { WebSocket?: unknown }).WebSocket = originalWebSocket
    ;(globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = originalXHR
  })

  it('signs successfully with fetch, WebSocket, and XMLHttpRequest all replaced with throwing spies', async () => {
    globalThis.fetch = (() => {
      throw new Error('network access attempted via fetch()')
    }) as typeof fetch
    ;(globalThis as { WebSocket?: unknown }).WebSocket = class {
      constructor() {
        throw new Error('network access attempted via WebSocket')
      }
    }
    ;(globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = class {
      constructor() {
        throw new Error('network access attempted via XMLHttpRequest')
      }
    }

    const signed = await signOfflineTransaction(PRIVATE_KEY, {
      chainId: 1,
      nonce: 0,
      to: RECIPIENT,
      value: 0n,
      gas: 21_000n,
      gasPrice: 1_000_000_000n,
    })
    expect(signed.raw).toMatch(/^0x[0-9a-fA-F]+$/)

    const signer = new OfflineSigner(PRIVATE_KEY)
    const signedAgain = await signer.signTransaction({
      type: 'eip1559',
      chainId: 1,
      nonce: 1,
      to: RECIPIENT,
      value: 0n,
      gas: 21_000n,
      maxFeePerGas: 2_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
    })
    expect(signedAgain.raw).toMatch(/^0x02[0-9a-fA-F]+$/)
  })

  it('requires no provider, client, or network argument to construct or sign', async () => {
    // OfflineSigner's constructor takes only a private key, and signTransaction
    // takes only the transaction object — there is no parameter slot for a
    // provider/client/RPC config, so this is also enforced at the type level.
    const signer = new OfflineSigner(PRIVATE_KEY)
    const signed = await signer.signTransaction({
      chainId: 1,
      nonce: 0,
      to: RECIPIENT,
      value: 0n,
      gas: 21_000n,
      gasPrice: 1_000_000_000n,
    })
    expect(signed.from).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
  })
})
