import { describe, it, expect } from 'vitest'
import {
  WHITECHAIN_EIP712,
  SECP256K1_HALF_ORDER,
  buildPermitPayload,
  hashPermitPayload,
  verifySignature,
  recoverPermitSigner,
  parseEip712Signature,
  type EIP712PermitPayload,
} from '../src/utils/signatures.js'
import { ValidationError } from '../src/errors/index.js'
import { privateKeyToAccount } from 'viem/accounts'
import { keccak256, stringToHex, encodeAbiParameters, concat, type Address, type Hex } from 'viem'

// Standard Anvil/Hardhat test accounts — same fixtures used across the
// existing SDK test suite (see tests/security/OfflineSigner.test.ts).
const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const PRIVATE_KEY_2 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const
const OTHER_SIGNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

const TOKEN: Address = '0x1111111111111111111111111111111111111111'
const SPENDER: Address = '0x2222222222222222222222222222222222222222'

const VALUE = 1_000_000_000_000_000_000n // 1 token (18 decimals)
const DEADLINE = 2_000_000_000n
const NONCE = 0n

const account = privateKeyToAccount(PRIVATE_KEY)

function buildPayload(overrides?: {
  value?: bigint
  chainId?: number
  verifyingContract?: Address
  name?: string
  version?: string
}): EIP712PermitPayload {
  return buildPermitPayload(OWNER, SPENDER, overrides?.value ?? VALUE, DEADLINE, NONCE, {
    verifyingContract: overrides?.verifyingContract ?? TOKEN,
    chainId: overrides?.chainId,
    name: overrides?.name,
    version: overrides?.version,
  })
}

/** Recomputes the EIP-712 digest exactly as an OpenZeppelin-style contract does. */
function contractStyleDigest(payload: EIP712PermitPayload): Hex {
  const { domain, message } = payload
  const DOMAIN_TYPEHASH = keccak256(
    stringToHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
  )
  const PERMIT_TYPEHASH = keccak256(
    stringToHex('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'),
  )

  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint256' },
      ] as const,
      [
        PERMIT_TYPEHASH,
        message.owner,
        message.spender,
        message.value,
        message.nonce,
        message.deadline,
      ],
    ),
  )

  const domainSeparator = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'address' },
      ] as const,
      [
        DOMAIN_TYPEHASH,
        keccak256(stringToHex(String(domain.name))),
        keccak256(stringToHex(String(domain.version))),
        BigInt(domain.chainId!),
        domain.verifyingContract!,
      ],
    ),
  )

  // EIP-712: keccak256("\x19\x01" ‖ domainSeparator ‖ structHash)
  return keccak256(concat(['0x1901', domainSeparator, structHash]))
}

describe('WHITECHAIN_EIP712 protocol domain variables', () => {
  it('defines the protocol standard name, version, and chain IDs', () => {
    expect(WHITECHAIN_EIP712.name).toBe('Whitelotus')
    expect(WHITECHAIN_EIP712.version).toBe('1')
    expect(WHITECHAIN_EIP712.chainId).toBe(1875) // WhiteChain mainnet
    expect(WHITECHAIN_EIP712.testnetChainId).toBe(2625) // WhiteChain testnet
  })

  it('exposes the correct secp256k1 half-order constant for the malleability guard', () => {
    // Well-known value: n/2 where n is the secp256k1 curve order.
    expect(SECP256K1_HALF_ORDER).toBe(
      0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n,
    )
    // Sanity: n = 2*(n/2) + 1 (n is odd) — the standard curve order.
    const n = SECP256K1_HALF_ORDER * 2n + 1n
    expect(n).toBe(0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n)
  })
})

describe('buildPermitPayload', () => {
  it('builds a payload with protocol-standard domain defaults', () => {
    const payload = buildPayload()
    expect(payload.primaryType).toBe('Permit')
    expect(payload.types.Permit.map((f) => f.name)).toEqual(['owner', 'spender', 'value', 'nonce', 'deadline'])
    expect(payload.domain).toEqual({
      name: 'Whitelotus',
      version: '1',
      chainId: 1875,
      verifyingContract: TOKEN,
    })
    expect(payload.message).toEqual({
      owner: OWNER,
      spender: SPENDER,
      value: VALUE,
      nonce: NONCE,
      deadline: DEADLINE,
    })
  })

  it('respects explicit domain overrides', () => {
    const payload = buildPayload({ chainId: 2625, name: 'Custom', version: '2' })
    expect(payload.domain).toEqual({
      name: 'Custom',
      version: '2',
      chainId: 2625,
      verifyingContract: TOKEN,
    })
  })

  it('normalizes number and string inputs to bigint', () => {
    const payload = buildPermitPayload(OWNER, SPENDER, '1000', 1234567890, 7n, {
      verifyingContract: TOKEN,
    })
    expect(payload.message.value).toBe(1000n)
    expect(payload.message.deadline).toBe(1234567890n)
    expect(payload.message.nonce).toBe(7n)
  })

  it('accepts a hex-string uint256 input', () => {
    const payload = buildPermitPayload(OWNER, SPENDER, '0x10', DEADLINE, NONCE, {
      verifyingContract: TOKEN,
    })
    expect(payload.message.value).toBe(16n)
  })

  it("does not enforce deadline expiry at build time (the contract's responsibility)", () => {
    const payload = buildPermitPayload(OWNER, SPENDER, VALUE, 0n, NONCE, { verifyingContract: TOKEN })
    expect(payload.message.deadline).toBe(0n)
  })

  it('throws ValidationError on a malformed owner address', () => {
    expect(() =>
      buildPermitPayload('0xdeadbeef', SPENDER, VALUE, DEADLINE, NONCE, { verifyingContract: TOKEN }),
    ).toThrow(ValidationError)
  })

  it('throws ValidationError on a malformed spender address', () => {
    expect(() =>
      buildPermitPayload(OWNER, 'not-an-address', VALUE, DEADLINE, NONCE, { verifyingContract: TOKEN }),
    ).toThrow(ValidationError)
  })

  it('throws ValidationError when verifyingContract is missing', () => {
    expect(() => buildPermitPayload(OWNER, SPENDER, VALUE, DEADLINE, NONCE, {} as never)).toThrow(ValidationError)
  })

  it('throws ValidationError on a negative value', () => {
    expect(() => buildPermitPayload(OWNER, SPENDER, -1n, DEADLINE, NONCE, { verifyingContract: TOKEN })).toThrow(
      ValidationError,
    )
  })

  it('throws ValidationError on a non-integer deadline', () => {
    expect(() => buildPermitPayload(OWNER, SPENDER, VALUE, 1.5, NONCE, { verifyingContract: TOKEN })).toThrow(
      ValidationError,
    )
  })
})

describe("hashPermitPayload — matches the smart contract's digest computation", () => {
  it('recomputes the exact OpenZeppelin-style _hashTypedDataV4 digest', () => {
    const payload = buildPayload()
    expect(hashPermitPayload(payload)).toBe(contractStyleDigest(payload))
  })

  it('digest changes when the domain (verifyingContract) changes', () => {
    const payloadA = buildPayload({ verifyingContract: TOKEN })
    const payloadB = buildPayload({ verifyingContract: '0x3333333333333333333333333333333333333333' })
    expect(hashPermitPayload(payloadA)).not.toBe(hashPermitPayload(payloadB))
  })

  it('digest changes when the message (value) changes', () => {
    const payloadA = buildPayload()
    const payloadB = buildPayload({ value: VALUE + 1n })
    expect(hashPermitPayload(payloadA)).not.toBe(hashPermitPayload(payloadB))
  })

  it('throws ValidationError on a malformed payload', () => {
    expect(() => hashPermitPayload({} as never)).toThrow(ValidationError)
  })
})

describe('verifySignature', () => {
  it('accepts a valid signature from the expected signer', async () => {
    const payload = buildPayload()
    const signature = await account.signTypedData(payload)
    expect(await verifySignature(payload, signature, OWNER)).toBe(true)
  })

  it('accepts a viem Signature object form (number, bigint, and yParity spellings)', async () => {
    const payload = buildPayload()
    const signature = await account.signTypedData(payload)
    const rHex = `0x${signature.slice(2, 66)}` as Hex
    const sHex = `0x${signature.slice(66, 130)}` as Hex
    const vRaw = parseInt(signature.slice(130, 132), 16) // 27 or 28

    // The same (r, s) pair only recovers the signer with the original
    // recovery bit — every accepted spelling must work.
    expect(await verifySignature(payload, { r: rHex, s: sHex, v: vRaw }, OWNER)).toBe(true)
    expect(await verifySignature(payload, { r: rHex, s: sHex, v: BigInt(vRaw) }, OWNER)).toBe(true)
    expect(await verifySignature(payload, { r: rHex, s: sHex, v: vRaw - 27 }, OWNER)).toBe(true) // 0/1
    expect(await verifySignature(payload, { r: rHex, s: sHex, yParity: vRaw - 27 }, OWNER)).toBe(true)

    // The opposite recovery bit yields a different address for the same r, s.
    const opposite = vRaw === 27 ? 28 : 27
    expect(await verifySignature(payload, { r: rHex, s: sHex, v: opposite }, OWNER)).toBe(false)
  })

  it('returns false when the signature was produced by a different signer', async () => {
    const payload = buildPayload()
    const otherAccount = privateKeyToAccount(PRIVATE_KEY_2)
    const signature = await otherAccount.signTypedData(payload)
    expect(await verifySignature(payload, signature, OWNER)).toBe(false)
  })

  it('returns false when the message was tampered with after signing', async () => {
    const signature = await account.signTypedData(buildPayload())
    const tampered = buildPayload({ value: VALUE + 1n })
    expect(await verifySignature(tampered, signature, OWNER)).toBe(false)
  })

  it('returns false when the domain was tampered with after signing', async () => {
    const signature = await account.signTypedData(buildPayload())
    const tamperedDomain = buildPayload({ verifyingContract: '0x3333333333333333333333333333333333333333' })
    expect(await verifySignature(tamperedDomain, signature, OWNER)).toBe(false)
  })

  it('rejects high-s (malleable) signatures with ValidationError', async () => {
    const payload = buildPayload()
    const signature = await account.signTypedData(payload)
    const rHex = `0x${signature.slice(2, 66)}` as Hex
    const sHex = `0x${signature.slice(66, 130)}` as Hex
    const vHex = signature.slice(130, 132)

    // Flip s to its equivalent high-s form: s' = n - s.
    const n = SECP256K1_HALF_ORDER * 2n + 1n
    const sBig = BigInt(sHex)
    const highS = `0x${rHex.slice(2)}${(n - sBig).toString(16).padStart(64, '0')}${vHex}` as Hex

    await expect(verifySignature(payload, highS, OWNER)).rejects.toThrow(ValidationError)
    await expect(verifySignature(payload, highS, OWNER)).rejects.toThrow(/high-s|malleability/i)
  })

  it('does not reject a signature whose s is exactly the half-order boundary', async () => {
    const payload = buildPayload()
    const signature = await account.signTypedData(payload)
    const rHex = `0x${signature.slice(2, 66)}` as Hex
    const vHex = signature.slice(130, 132)

    const boundary = `0x${rHex.slice(2)}${SECP256K1_HALF_ORDER.toString(16).padStart(64, '0')}${vHex}` as Hex
    // s == n/2 is not high-s: must not throw, and simply not verify.
    expect(await verifySignature(payload, boundary, OWNER)).toBe(false)
  })

  it('throws ValidationError on a malformed signature hex (wrong length)', async () => {
    const payload = buildPayload()
    await expect(verifySignature(payload, '0x1234' as Hex, OWNER)).rejects.toThrow(ValidationError)
  })

  it('throws ValidationError on an invalid v byte (29)', async () => {
    const payload = buildPayload()
    const signature = await account.signTypedData(payload)
    const malformed = `${signature.slice(0, signature.length - 2)}1d` as Hex // v = 0x1d = 29
    await expect(verifySignature(payload, malformed, OWNER)).rejects.toThrow(ValidationError)
  })

  it('throws ValidationError on a malformed expectedSigner', async () => {
    const payload = buildPayload()
    const signature = await account.signTypedData(payload)
    await expect(verifySignature(payload, signature, '0xzz' as Address)).rejects.toThrow(ValidationError)
  })

  it('is fully offline — no provider or network is involved', async () => {
    // The signature above was created with a bare viem account (no client),
    // and verification below happens on the same object. No transport exists.
    const payload = buildPayload()
    const signature = await account.signTypedData(payload)
    expect(await verifySignature(payload, signature, OWNER)).toBe(true)
  })
})

describe('recoverPermitSigner', () => {
  it('recovers the signer address from a valid signature', async () => {
    const payload = buildPayload()
    const signature = await account.signTypedData(payload)
    expect((await recoverPermitSigner(payload, signature)).toLowerCase()).toBe(OWNER.toLowerCase())
  })

  it('recovers the second signer from their own signature', async () => {
    const payload = buildPayload()
    const otherAccount = privateKeyToAccount(PRIVATE_KEY_2)
    const signature = await otherAccount.signTypedData(payload)
    expect((await recoverPermitSigner(payload, signature)).toLowerCase()).toBe(OTHER_SIGNER.toLowerCase())
  })

  it('throws ValidationError on a high-s signature', async () => {
    const payload = buildPayload()
    const signature = await account.signTypedData(payload)
    const rHex = `0x${signature.slice(2, 66)}` as Hex
    const sHex = `0x${signature.slice(66, 130)}` as Hex
    const vHex = signature.slice(130, 132)
    const n = SECP256K1_HALF_ORDER * 2n + 1n
    const highS = `0x${rHex.slice(2)}${(n - BigInt(sHex)).toString(16).padStart(64, '0')}${vHex}` as Hex
    await expect(recoverPermitSigner(payload, highS)).rejects.toThrow(ValidationError)
  })
})

describe('parseEip712Signature', () => {
  it('splits a 65-byte hex signature into r, s, v', async () => {
    const payload = buildPayload()
    const signature = await account.signTypedData(payload)
    const parsed = parseEip712Signature(signature)

    expect(parsed.hex).toBe(signature)
    expect(parsed.r).toBe(BigInt(`0x${signature.slice(2, 66)}`))
    expect(parsed.s).toBe(BigInt(`0x${signature.slice(66, 130)}`))
    expect(parsed.v).toBe(parseInt(signature.slice(130, 132), 16))
  })

  it('throws ValidationError on non-hex input', () => {
    expect(() => parseEip712Signature('zz' as Hex)).toThrow(ValidationError)
  })

  it('throws ValidationError on an object with a malformed r', () => {
    expect(() => parseEip712Signature({ r: '0x01', s: `0x${'11'.repeat(32)}`, v: 27 })).toThrow(ValidationError)
  })
})
