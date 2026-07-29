import { describe, it, expect } from 'vitest'
import { parseTransaction, recoverTransactionAddress } from 'viem'
import {
  OfflineSigner,
  signOfflineTransaction,
  type OfflineEip1559Transaction,
  type OfflineLegacyTransaction,
} from '../../src/security/OfflineSigner.js'
import { ValidationError } from '../../src/errors/index.js'

// Standard Anvil/Hardhat test account #0 — same fixture already used by
// tests/wallet/HDWallet.test.ts, so the expected address is a known value.
const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const RECIPIENT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

const baseLegacy: OfflineLegacyTransaction = {
  chainId: 1,
  nonce: 5,
  to: RECIPIENT,
  value: 1_000_000_000_000_000_000n,
  gas: 21_000n,
  gasPrice: 20_000_000_000n,
}

const baseEip1559: OfflineEip1559Transaction = {
  type: 'eip1559',
  chainId: 1,
  nonce: 5,
  to: RECIPIENT,
  value: 1_000_000_000_000_000_000n,
  gas: 21_000n,
  maxFeePerGas: 30_000_000_000n,
  maxPriorityFeePerGas: 2_000_000_000n,
}

describe('OfflineSigner — legacy transactions', () => {
  it('produces a 0x-prefixed signed payload', async () => {
    const signer = new OfflineSigner(PRIVATE_KEY)
    const signed = await signer.signTransaction(baseLegacy)

    expect(signed.raw).toMatch(/^0x[0-9a-fA-F]+$/)
    expect(signed.hash).toMatch(/^0x[0-9a-fA-F]{64}$/)
    expect(signed.from).toBe(ADDRESS)
  })

  it('round-trips through parseTransaction preserving chainId, nonce, to, value, gas, and gasPrice', async () => {
    const signed = await signOfflineTransaction(PRIVATE_KEY, baseLegacy)
    const parsed = parseTransaction(signed.raw)

    expect(parsed.chainId).toBe(baseLegacy.chainId)
    expect(parsed.nonce).toBe(baseLegacy.nonce)
    expect(parsed.to?.toLowerCase()).toBe(RECIPIENT.toLowerCase())
    expect(parsed.value).toBe(baseLegacy.value)
    expect(parsed.gas).toBe(baseLegacy.gas)
    expect((parsed as { gasPrice?: bigint }).gasPrice).toBe(baseLegacy.gasPrice)
  })

  it('recovers the signer address from the raw payload alone', async () => {
    const signed = await signOfflineTransaction(PRIVATE_KEY, baseLegacy)
    const recovered = await recoverTransactionAddress({ serializedTransaction: signed.raw })
    expect(recovered).toBe(ADDRESS)
  })

  it('supports contract-creation transactions (to omitted) with calldata preserved', async () => {
    const signed = await signOfflineTransaction(PRIVATE_KEY, {
      ...baseLegacy,
      to: null,
      data: '0x60806040',
    })
    const parsed = parseTransaction(signed.raw)
    expect(parsed.to).toBeFalsy()
    expect((parsed as { data?: string }).data).toBe('0x60806040')
  })

  it('supports a native value transfer with empty calldata', async () => {
    const signed = await signOfflineTransaction(PRIVATE_KEY, { ...baseLegacy })
    const parsed = parseTransaction(signed.raw)
    expect(parsed.value).toBe(baseLegacy.value)
    expect((parsed as { data?: string }).data ?? '0x').toBe('0x')
  })

  it('supports a zero-value calldata-only transaction', async () => {
    const signed = await signOfflineTransaction(PRIVATE_KEY, {
      ...baseLegacy,
      value: 0n,
      data: '0xa9059cbb000000000000000000000000',
    })
    const parsed = parseTransaction(signed.raw)
    expect(parsed.value ?? 0n).toBe(0n)
    expect((parsed as { data?: string }).data).toBe('0xa9059cbb000000000000000000000000')
  })
})

describe('OfflineSigner — EIP-1559 transactions', () => {
  it('produces a 0x02-prefixed signed payload', async () => {
    const signed = await signOfflineTransaction(PRIVATE_KEY, baseEip1559)
    expect(signed.raw).toMatch(/^0x02[0-9a-fA-F]+$/)
    expect(signed.from).toBe(ADDRESS)
  })

  it('round-trips through parseTransaction preserving chainId, nonce, to, value, gas, and fee fields', async () => {
    const signed = await signOfflineTransaction(PRIVATE_KEY, baseEip1559)
    const parsed = parseTransaction(signed.raw)

    expect(parsed.type).toBe('eip1559')
    expect(parsed.chainId).toBe(baseEip1559.chainId)
    expect(parsed.nonce).toBe(baseEip1559.nonce)
    expect(parsed.to?.toLowerCase()).toBe(RECIPIENT.toLowerCase())
    expect(parsed.value).toBe(baseEip1559.value)
    expect(parsed.gas).toBe(baseEip1559.gas)
    expect((parsed as { maxFeePerGas?: bigint }).maxFeePerGas).toBe(baseEip1559.maxFeePerGas)
    expect((parsed as { maxPriorityFeePerGas?: bigint }).maxPriorityFeePerGas).toBe(
      baseEip1559.maxPriorityFeePerGas,
    )
  })

  it('recovers the signer address from the raw payload alone', async () => {
    const signed = await signOfflineTransaction(PRIVATE_KEY, baseEip1559)
    const recovered = await recoverTransactionAddress({ serializedTransaction: signed.raw })
    expect(recovered).toBe(ADDRESS)
  })

  it('rejects maxPriorityFeePerGas greater than maxFeePerGas', async () => {
    await expect(
      signOfflineTransaction(PRIVATE_KEY, {
        ...baseEip1559,
        maxFeePerGas: 1_000n,
        maxPriorityFeePerGas: 2_000n,
      }),
    ).rejects.toThrow(ValidationError)
  })

  it('accepts maxPriorityFeePerGas equal to maxFeePerGas', async () => {
    const signed = await signOfflineTransaction(PRIVATE_KEY, {
      ...baseEip1559,
      maxFeePerGas: 5_000n,
      maxPriorityFeePerGas: 5_000n,
    })
    expect(signed.raw).toMatch(/^0x02[0-9a-fA-F]+$/)
  })
})

describe('OfflineSigner — determinism', () => {
  it('produces byte-identical output for the same key and transaction', async () => {
    const first = await signOfflineTransaction(PRIVATE_KEY, baseLegacy)
    const second = await signOfflineTransaction(PRIVATE_KEY, baseLegacy)
    expect(first.raw).toBe(second.raw)
    expect(first.hash).toBe(second.hash)
  })

  it('produces byte-identical output for EIP-1559 transactions too', async () => {
    const first = await signOfflineTransaction(PRIVATE_KEY, baseEip1559)
    const second = await signOfflineTransaction(PRIVATE_KEY, baseEip1559)
    expect(first.raw).toBe(second.raw)
  })

  it('changing only the nonce changes the signed payload', async () => {
    const a = await signOfflineTransaction(PRIVATE_KEY, { ...baseLegacy, nonce: 5 })
    const b = await signOfflineTransaction(PRIVATE_KEY, { ...baseLegacy, nonce: 6 })
    expect(a.raw).not.toBe(b.raw)
    expect(a.hash).not.toBe(b.hash)
  })
})

describe('OfflineSigner — large bigint values', () => {
  it('signs a transaction with a very large but valid value, gas, and fee fields', async () => {
    const signed = await signOfflineTransaction(PRIVATE_KEY, {
      type: 'eip1559',
      chainId: 1,
      nonce: 0,
      to: RECIPIENT,
      value: 1_000_000_000_000_000_000_000_000n, // 1,000,000 ETH in wei
      gas: 30_000_000n, // near a realistic block gas limit
      maxFeePerGas: 500_000_000_000n, // 500 gwei
      maxPriorityFeePerGas: 10_000_000_000n,
    })
    const parsed = parseTransaction(signed.raw)
    expect(parsed.value).toBe(1_000_000_000_000_000_000_000_000n)
    expect(parsed.gas).toBe(30_000_000n)
  })
})

describe('OfflineSigner — private key validation', () => {
  it('rejects a malformed hex private key', () => {
    expect(() => new OfflineSigner('0xdeadbeef' as `0x${string}`)).toThrow(ValidationError)
  })

  it('rejects a private key missing the 0x prefix', () => {
    expect(
      () => new OfflineSigner('ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`),
    ).toThrow(ValidationError)
  })

  it('rejects a wrong-length private key Uint8Array', () => {
    expect(() => new OfflineSigner(new Uint8Array(16))).toThrow(ValidationError)
  })

  it('rejects a non-string, non-Uint8Array private key', () => {
    expect(() => new OfflineSigner(12345 as unknown as `0x${string}`)).toThrow(ValidationError)
  })

  it('accepts a Uint8Array private key equivalent to its hex form', async () => {
    const bytes = Uint8Array.from(Buffer.from(PRIVATE_KEY.slice(2), 'hex'))
    const signer = new OfflineSigner(bytes)
    expect(signer.address).toBe(ADDRESS)
  })
})

describe('OfflineSigner — transaction field validation', () => {
  it('rejects a negative nonce', async () => {
    await expect(signOfflineTransaction(PRIVATE_KEY, { ...baseLegacy, nonce: -1 })).rejects.toThrow(
      ValidationError,
    )
  })

  it('rejects a non-integer nonce', async () => {
    await expect(signOfflineTransaction(PRIVATE_KEY, { ...baseLegacy, nonce: 1.5 })).rejects.toThrow(
      ValidationError,
    )
  })

  it('rejects an invalid (non-integer) chainId', async () => {
    await expect(signOfflineTransaction(PRIVATE_KEY, { ...baseLegacy, chainId: 1.5 })).rejects.toThrow(
      ValidationError,
    )
  })

  it('rejects a chainId of 0', async () => {
    await expect(signOfflineTransaction(PRIVATE_KEY, { ...baseLegacy, chainId: 0 })).rejects.toThrow(
      ValidationError,
    )
  })

  it('rejects a negative chainId', async () => {
    await expect(signOfflineTransaction(PRIVATE_KEY, { ...baseLegacy, chainId: -1 })).rejects.toThrow(
      ValidationError,
    )
  })

  it('rejects a zero gas limit', async () => {
    await expect(signOfflineTransaction(PRIVATE_KEY, { ...baseLegacy, gas: 0n })).rejects.toThrow(
      ValidationError,
    )
  })

  it('rejects a negative gas limit', async () => {
    await expect(signOfflineTransaction(PRIVATE_KEY, { ...baseLegacy, gas: -1n })).rejects.toThrow(
      ValidationError,
    )
  })

  it('rejects a negative value', async () => {
    await expect(signOfflineTransaction(PRIVATE_KEY, { ...baseLegacy, value: -1n })).rejects.toThrow(
      ValidationError,
    )
  })

  it('rejects a negative gasPrice on a legacy transaction', async () => {
    await expect(signOfflineTransaction(PRIVATE_KEY, { ...baseLegacy, gasPrice: -1n })).rejects.toThrow(
      ValidationError,
    )
  })

  it('rejects a negative maxFeePerGas on an EIP-1559 transaction', async () => {
    await expect(
      signOfflineTransaction(PRIVATE_KEY, { ...baseEip1559, maxFeePerGas: -1n }),
    ).rejects.toThrow(ValidationError)
  })

  it('rejects a negative maxPriorityFeePerGas on an EIP-1559 transaction', async () => {
    await expect(
      signOfflineTransaction(PRIVATE_KEY, { ...baseEip1559, maxPriorityFeePerGas: -1n }),
    ).rejects.toThrow(ValidationError)
  })

  it('rejects a malformed "to" address', async () => {
    await expect(
      signOfflineTransaction(PRIVATE_KEY, { ...baseLegacy, to: '0xnotanaddress' as `0x${string}` }),
    ).rejects.toThrow(ValidationError)
  })

  it('rejects an incorrectly checksummed mixed-case "to" address', async () => {
    const badChecksum = '0x70997970C51812dc3A010C7d01b50e0d17dc79c9' // last char flipped
    await expect(
      signOfflineTransaction(PRIVATE_KEY, { ...baseLegacy, to: badChecksum as `0x${string}` }),
    ).rejects.toThrow(ValidationError)
  })

  it('accepts a plain lowercase "to" address (no checksum required)', async () => {
    const signed = await signOfflineTransaction(PRIVATE_KEY, {
      ...baseLegacy,
      to: RECIPIENT.toLowerCase() as `0x${string}`,
    })
    expect(signed.from).toBe(ADDRESS)
  })

  it('rejects malformed call data', async () => {
    await expect(
      signOfflineTransaction(PRIVATE_KEY, { ...baseLegacy, data: '0xzz' as `0x${string}` }),
    ).rejects.toThrow(ValidationError)
  })

  it('rejects call data with an odd number of hex digits', async () => {
    await expect(
      signOfflineTransaction(PRIVATE_KEY, { ...baseLegacy, data: '0xabc' as `0x${string}` }),
    ).rejects.toThrow(ValidationError)
  })
})

describe('OfflineSigner — missing mandatory fields fail locally', () => {
  it('rejects a transaction missing nonce without attempting any lookup', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (() => {
      throw new Error('a network lookup was attempted to fill a missing field')
    }) as typeof fetch

    try {
      const incomplete = { ...baseLegacy } as Partial<OfflineLegacyTransaction>
      delete incomplete.nonce
      await expect(
        signOfflineTransaction(PRIVATE_KEY, incomplete as OfflineLegacyTransaction),
      ).rejects.toThrow(ValidationError)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('rejects a transaction missing gas without attempting any lookup', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (() => {
      throw new Error('a network lookup was attempted to fill a missing field')
    }) as typeof fetch

    try {
      const incomplete = { ...baseLegacy } as Partial<OfflineLegacyTransaction>
      delete incomplete.gas
      await expect(
        signOfflineTransaction(PRIVATE_KEY, incomplete as OfflineLegacyTransaction),
      ).rejects.toThrow(ValidationError)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('rejects an EIP-1559 transaction missing maxPriorityFeePerGas without attempting any lookup', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (() => {
      throw new Error('a network lookup was attempted to fill a missing field')
    }) as typeof fetch

    try {
      const incomplete = { ...baseEip1559 } as Partial<OfflineEip1559Transaction>
      delete incomplete.maxPriorityFeePerGas
      await expect(
        signOfflineTransaction(PRIVATE_KEY, incomplete as OfflineEip1559Transaction),
      ).rejects.toThrow(ValidationError)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
