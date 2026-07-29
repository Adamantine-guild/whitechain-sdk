import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { keccak256, toBytes, toHex, type Hex } from 'viem'
import { verifyAccountProof, verifyStorageProof, EMPTY_CODE_HASH, EMPTY_TRIE_ROOT } from '../../src/crypto/StateProver.js'
import { buildSingleLeafTrie, encodeAccountRlp, keyToNibblesLocal } from './trieFixtures.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const cryptoSrcFiles = [
  join(repoRoot, 'src', 'crypto', 'StateProver.ts'),
  join(repoRoot, 'src', 'crypto', 'rlp.ts'),
]

/** Strips comments so the scan only matches actual code, not this module's own JSDoc. */
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
  { name: 'getProof(', pattern: /\bgetProof\s*\(/ },
  { name: 'getBlock(', pattern: /\bgetBlock\s*\(/ },
  { name: 'node:http(s) import', pattern: /from ['"]node:https?['"]/ },
]

/**
 * Issue: "Build Cross-Chain State Proof Verifier Utility". StateProver must
 * validate EIP-1186 proofs entirely locally against a caller-supplied
 * stateRoot — no RPC, HTTP, provider, transport, or client of any kind, and
 * never a block-hash-to-header fetch in place of a trusted stateRoot.
 */
describe('StateProver has no network operations (local-only guarantee)', () => {
  it('never references RPC/network/client symbols in src/crypto/StateProver.ts or rlp.ts', () => {
    for (const file of cryptoSrcFiles) {
      const code = stripComments(readFileSync(file, 'utf-8'))
      for (const { name, pattern } of FORBIDDEN_PATTERNS) {
        expect(code, `${file} should not reference "${name}" in code`).not.toMatch(pattern)
      }
    }
  })

  it('never imports a provider/transport/network/client module', () => {
    for (const file of cryptoSrcFiles) {
      const content = readFileSync(file, 'utf-8')
      expect(content, `${file} should not import a network provider`).not.toMatch(
        /from ['"].*\/(providers|network)\//,
      )
    }
  })

  it('never imports axios or another HTTP client dependency', () => {
    for (const file of cryptoSrcFiles) {
      const content = readFileSync(file, 'utf-8')
      expect(content, `${file} should not import an HTTP client`).not.toMatch(
        /from ['"](axios|node-fetch|undici|ethers)['"]/,
      )
    }
  })

  it('only imports from viem and its own sibling module', () => {
    for (const file of cryptoSrcFiles) {
      const content = readFileSync(file, 'utf-8')
      const importLines = content.match(/^import .+$/gm) ?? []
      for (const line of importLines) {
        expect(line).toMatch(/from ['"](viem|\.\/rlp\.js)['"]/)
      }
    }
  })
})

describe('StateProver never performs network I/O at runtime', () => {
  const originalFetch = globalThis.fetch
  const originalWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket
  const originalXHR = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest

  afterEach(() => {
    globalThis.fetch = originalFetch
    ;(globalThis as { WebSocket?: unknown }).WebSocket = originalWebSocket
    ;(globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = originalXHR
  })

  it('verifies a proof successfully with fetch, WebSocket, and XMLHttpRequest all replaced with throwing spies', () => {
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

    const address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const
    const nonce = 1n
    const balance = 0n
    const nibbles = keyToNibblesLocal(keccak256(toBytes(address), 'bytes'))
    const accountRlp = encodeAccountRlp({ nonce, balance, storageRoot: EMPTY_TRIE_ROOT, codeHash: EMPTY_CODE_HASH })
    const { root, proof } = buildSingleLeafTrie(nibbles, accountRlp)

    const result = verifyAccountProof(root, {
      address,
      nonce,
      balance,
      codeHash: EMPTY_CODE_HASH,
      storageHash: EMPTY_TRIE_ROOT,
      accountProof: proof,
    })
    expect(result).toEqual({ valid: true, kind: 'inclusion' })

    const slot32 = toHex(1n, { size: 32 }) as Hex
    const storageResult = verifyStorageProof(EMPTY_TRIE_ROOT, { key: slot32, value: 0n, proof: [] })
    expect(storageResult).toEqual({ valid: true, kind: 'exclusion' })
  })

  it('requires no provider, client, or network argument to call', () => {
    // verifyAccountProof/verifyStorageProof take only plain data (a hex
    // stateRoot and a plain proof object) — there is no parameter slot for
    // a provider/client/RPC config, so this is also enforced at the type level.
    expect(verifyAccountProof.length).toBe(2)
    expect(verifyStorageProof.length).toBe(2)
  })
})
