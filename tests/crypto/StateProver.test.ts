import { describe, it, expect } from 'vitest'
import { keccak256, toBytes, toHex, toRlp, type Hex } from 'viem'
import {
  verifyAccountProof,
  verifyStorageProof,
  verifyEIP1186Proof,
  isValidStateProof,
  EMPTY_TRIE_ROOT,
  EMPTY_CODE_HASH,
  type AccountProofInput,
} from '../../src/crypto/StateProver.js'
import {
  buildSingleLeafTrie,
  buildExtensionBranchTrie,
  buildEmbeddedLeafTrie,
  encodeAccountRlp,
  keyToNibblesLocal,
  minimalBytes,
} from './trieFixtures.js'

// Well-known, publicly documented test addresses (Hardhat/Anvil default
// accounts #0 and #1) — already used elsewhere in this repo's fixtures
// (tests/security/no-network.test.ts), reused here for consistency.
const ADDRESS_A = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const
const ADDRESS_B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const

function accountKeyNibbles(address: Hex): number[] {
  return keyToNibblesLocal(keccak256(toBytes(address), 'bytes'))
}

function storageKeyNibbles(slot32: Hex): number[] {
  return keyToNibblesLocal(keccak256(toBytes(slot32), 'bytes'))
}

describe('verifyAccountProof — single-leaf trie (root is the leaf)', () => {
  const nonce = 5n
  const balance = 1_000_000_000_000_000_000n
  const codeHash = EMPTY_CODE_HASH
  const storageHash = EMPTY_TRIE_ROOT
  const accountRlp = encodeAccountRlp({ nonce, balance, storageRoot: storageHash, codeHash })
  const nibbles = accountKeyNibbles(ADDRESS_A)
  const { root, proof } = buildSingleLeafTrie(nibbles, accountRlp)

  const baseProof: AccountProofInput = {
    address: ADDRESS_A,
    nonce,
    balance,
    codeHash,
    storageHash,
    accountProof: proof,
  }

  it('verifies a valid inclusion proof', () => {
    expect(verifyAccountProof(root, baseProof)).toEqual({ valid: true, kind: 'inclusion' })
  })

  it('accepts nonce as a plain number as well as bigint', () => {
    const result = verifyAccountProof(root, { ...baseProof, nonce: Number(nonce) })
    expect(result).toEqual({ valid: true, kind: 'inclusion' })
  })

  it('rejects a tampered state root', () => {
    const wrongRoot = (root.slice(0, -1) + (root.endsWith('0') ? '1' : '0')) as Hex
    const result = verifyAccountProof(wrongRoot, baseProof)
    expect(result.valid).toBe(false)
  })

  it('rejects a tampered proof node byte', () => {
    const tampered = toBytes(proof[0])
    tampered[10] ^= 0xff
    const result = verifyAccountProof(root, { ...baseProof, accountProof: [toHex(tampered)] })
    expect(result.valid).toBe(false)
  })

  it.each([
    ['nonce', { nonce: nonce + 1n }],
    ['balance', { balance: balance + 1n }],
    ['codeHash', { codeHash: EMPTY_TRIE_ROOT }], // any other valid-looking 32-byte hash
    ['storageHash', { storageHash: EMPTY_CODE_HASH }],
  ])('rejects a claimed %s that does not match the proven account', (field, override) => {
    const result = verifyAccountProof(root, { ...baseProof, ...override })
    expect(result.valid).toBe(false)
    expect((result as { reason: string }).reason).toMatch(new RegExp(field))
  })

  it('produces a valid exclusion proof for a different address against the same trie', () => {
    const result = verifyAccountProof(root, { ...baseProof, address: ADDRESS_B })
    expect(result).toEqual({ valid: true, kind: 'exclusion' })
  })

  it('reports a malformed (not merely excluded) proof for an empty accountProof against a non-empty root', () => {
    const result = verifyAccountProof(root, { ...baseProof, accountProof: [] })
    expect(result.valid).toBe(false)
  })

  it('rejects a proof node exceeding the maximum node size', () => {
    const oversized = toHex(new Uint8Array(2000).fill(0xab))
    const result = verifyAccountProof(root, { ...baseProof, accountProof: [oversized] })
    expect(result.valid).toBe(false)
    expect((result as { reason: string }).reason).toMatch(/exceeding the maximum/)
  })

  it('rejects a proof array exceeding the maximum node count', () => {
    const many = Array.from({ length: 200 }, () => proof[0])
    const result = verifyAccountProof(root, { ...baseProof, accountProof: many })
    expect(result.valid).toBe(false)
    expect((result as { reason: string }).reason).toMatch(/exceeding the maximum/)
  })
})

describe('verifyStorageProof — extension + branch trie', () => {
  const slot32 = toHex(1n, { size: 32 })
  const targetValue = 42n
  const nibbles = storageKeyNibbles(slot32)
  const branchDepth = 4
  const storageLeafValue = toRlp(toHex(minimalBytes(targetValue)), 'bytes')
  const { root, proof } = buildExtensionBranchTrie(nibbles, branchDepth, storageLeafValue)

  it('verifies a valid inclusion proof', () => {
    const result = verifyStorageProof(root, { key: slot32, value: targetValue, proof })
    expect(result).toEqual({ valid: true, kind: 'inclusion' })
  })

  it('treats a canonically-equal but differently-formatted claimed value as a match (leading zeros)', () => {
    const paddedValue = toHex(targetValue, { size: 32 }) // same integer, 32-byte hex form
    const result = verifyStorageProof(root, { key: slot32, value: paddedValue, proof })
    expect(result).toEqual({ valid: true, kind: 'inclusion' })
  })

  it('accepts a plain number claimed value', () => {
    const result = verifyStorageProof(root, { key: slot32, value: Number(targetValue), proof })
    expect(result).toEqual({ valid: true, kind: 'inclusion' })
  })

  it('rejects a mismatched claimed value', () => {
    const result = verifyStorageProof(root, { key: slot32, value: targetValue + 1n, proof })
    expect(result.valid).toBe(false)
  })

  it('rejects a tampered branch node (breaks the hash chain)', () => {
    const tamperedBranch = toBytes(proof[1])
    tamperedBranch[5] ^= 0xff
    const tamperedProof = [proof[0], toHex(tamperedBranch), proof[2]]
    const result = verifyStorageProof(root, { key: slot32, value: targetValue, proof: tamperedProof })
    expect(result.valid).toBe(false)
  })

  it('normalizes a shorter-than-32-byte storage key before hashing', () => {
    // slot32 is `1n` left-padded to 32 bytes; an unpadded `0x01` must hash identically.
    const result = verifyStorageProof(root, { key: '0x01', value: targetValue, proof })
    expect(result).toEqual({ valid: true, kind: 'inclusion' })
  })

  it('produces a valid exclusion proof for a key landing on an empty branch slot', () => {
    // Brute-force a second real key whose hash shares the extension's nibble
    // prefix (so it walks the same extension into the same branch) but whose
    // nibble at the branch depth lands on neither the target's nor the
    // sibling placeholder's occupied slot — guaranteeing a clean, unambiguous
    // "excluded" outcome rather than a hash-mismatch on an unrelated subtree.
    const targetNibbleAtDepth = nibbles[branchDepth]
    const siblingNibble = (targetNibbleAtDepth + 1) % 16
    const forbidden = new Set([targetNibbleAtDepth, siblingNibble])
    const prefix = nibbles.slice(0, branchDepth)

    let divergentKey: Hex | undefined
    for (let i = 0n; i < 500_000n; i++) {
      const candidateKey = toHex(i, { size: 32 })
      const candidateNibbles = storageKeyNibbles(candidateKey)
      let matchesPrefix = true
      for (let j = 0; j < branchDepth; j++) {
        if (candidateNibbles[j] !== prefix[j]) {
          matchesPrefix = false
          break
        }
      }
      if (matchesPrefix && !forbidden.has(candidateNibbles[branchDepth])) {
        divergentKey = candidateKey
        break
      }
    }
    expect(divergentKey).toBeDefined()

    const result = verifyStorageProof(root, { key: divergentKey as Hex, value: 0n, proof })
    expect(result).toEqual({ valid: true, kind: 'exclusion' })
  })
})

describe('verifyStorageProof — embedded child node', () => {
  const slot32 = toHex(2n, { size: 32 })
  const targetValue = 7n
  const nibbles = storageKeyNibbles(slot32)
  const branchDepth = 60
  const storageLeafValue = toRlp(toHex(minimalBytes(targetValue)), 'bytes')
  const { root, proof } = buildEmbeddedLeafTrie(nibbles, branchDepth, storageLeafValue)

  it('has no separate proof entry for the embedded leaf', () => {
    expect(proof).toHaveLength(2) // extension + branch only; leaf is inlined
  })

  it('verifies a valid inclusion proof through the embedded leaf', () => {
    const result = verifyStorageProof(root, { key: slot32, value: targetValue, proof })
    expect(result).toEqual({ valid: true, kind: 'inclusion' })
  })
})

describe('verifyStorageProof — empty trie', () => {
  it('accepts a zero-value exclusion proof with an empty proof array against EMPTY_TRIE_ROOT', () => {
    const result = verifyStorageProof(EMPTY_TRIE_ROOT, { key: toHex(1n, { size: 32 }), value: 0n, proof: [] })
    expect(result).toEqual({ valid: true, kind: 'exclusion' })
  })

  it('rejects a non-zero claimed value against an empty trie', () => {
    const result = verifyStorageProof(EMPTY_TRIE_ROOT, { key: toHex(1n, { size: 32 }), value: 5n, proof: [] })
    expect(result.valid).toBe(false)
  })

  it('rejects an empty proof array against a non-empty, non-canonical root', () => {
    const result = verifyStorageProof(keccak256('0x1234'), { key: toHex(1n, { size: 32 }), value: 0n, proof: [] })
    expect(result.valid).toBe(false)
  })
})

describe('verifyEIP1186Proof and isValidStateProof', () => {
  const nonce = 3n
  const balance = 500n
  const slot32 = toHex(5n, { size: 32 })
  const slotValue = 9n

  const accountNibbles = accountKeyNibbles(ADDRESS_A)
  const storageNibbles = storageKeyNibbles(slot32)
  const storageTrie = buildSingleLeafTrie(storageNibbles, toRlp(toHex(minimalBytes(slotValue)), 'bytes'))

  const accountRlp = encodeAccountRlp({
    nonce,
    balance,
    storageRoot: storageTrie.root,
    codeHash: EMPTY_CODE_HASH,
  })
  const accountTrie = buildSingleLeafTrie(accountNibbles, accountRlp)

  const fullProof: AccountProofInput = {
    address: ADDRESS_A,
    nonce,
    balance,
    codeHash: EMPTY_CODE_HASH,
    storageHash: storageTrie.root,
    accountProof: accountTrie.proof,
    storageProof: [{ key: slot32, value: slotValue, proof: storageTrie.proof }],
  }

  it('verifies account + storage together and reports both as valid', () => {
    const result = verifyEIP1186Proof(accountTrie.root, fullProof)
    expect(result.valid).toBe(true)
    expect(result.account).toEqual({ valid: true, kind: 'inclusion' })
    expect(result.storageProofs).toEqual([{ key: slot32, result: { valid: true, kind: 'inclusion' } }])
  })

  it('is false overall when the account proof is valid but a storage slot is wrong', () => {
    const badProof: AccountProofInput = {
      ...fullProof,
      storageProof: [{ key: slot32, value: slotValue + 1n, proof: storageTrie.proof }],
    }
    const result = verifyEIP1186Proof(accountTrie.root, badProof)
    expect(result.valid).toBe(false)
    expect(result.account.valid).toBe(true)
    expect(result.storageProofs[0].result.valid).toBe(false)
  })

  it('isValidStateProof returns true for a fully valid proof and false for a tampered one', () => {
    expect(isValidStateProof(accountTrie.root, fullProof)).toBe(true)
    expect(isValidStateProof(accountTrie.root, { ...fullProof, balance: balance + 1n })).toBe(false)
  })
})
