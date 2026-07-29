import { describe, it, expect, vi } from 'vitest'
import { signERC20Permit, splitSignature } from '../../src/utils/permit.js'
import type { Address } from 'viem'

describe('EIP-2612 Permit Signing Helper (signERC20Permit)', () => {
  const tokenAddress: Address = '0x1111111111111111111111111111111111111111'
  const owner: Address = '0x2222222222222222222222222222222222222222'
  const spender: Address = '0x3333333333333333333333333333333333333333'

  const rHex = '1111111111111111111111111111111111111111111111111111111111111111' // Exactly 64 chars
  const sHex = '2222222222222222222222222222222222222222222222222222222222222222' // Exactly 64 chars
  const vHex = '1b' // Exactly 2 chars (27)
  const dummySignatureHex = `0x${rHex}${sHex}${vHex}` as `0x${string}` // Exactly 130 hex chars (65 bytes)

  it('correctly splits a 65-byte hex signature into v, r, s components', () => {
    const { v, r, s } = splitSignature(dummySignatureHex)
    expect(r).toBe(`0x${rHex}`)
    expect(s).toBe(`0x${sHex}`)
    expect(v).toBe(27)
  })

  it('structures EIP-712 domain and typed message and calls signer.signTypedData', async () => {
    const mockSigner = {
      signTypedData: vi.fn().mockResolvedValue(dummySignatureHex),
    }

    const mockPublicClient = {
      readContract: vi.fn().mockImplementation(async ({ functionName }: { functionName: string }) => {
        if (functionName === 'name') return 'Whitelotus Token'
        if (functionName === 'nonces') return 5n
        return null
      }),
    }

    const result = await signERC20Permit({
      tokenAddress,
      owner,
      spender,
      value: 1000000000000000000n, // 1 WTC
      chainId: 1,
      signer: mockSigner,
      publicClient: mockPublicClient,
    })

    expect(mockPublicClient.readContract).toHaveBeenCalledTimes(2)
    expect(mockSigner.signTypedData).toHaveBeenCalledWith({
      account: owner,
      domain: {
        name: 'Whitelotus Token',
        version: '1',
        chainId: 1,
        verifyingContract: tokenAddress,
      },
      types: expect.any(Object),
      primaryType: 'Permit',
      message: {
        owner,
        spender,
        value: 1000000000000000000n,
        nonce: 5n,
        deadline: expect.any(BigInt),
      },
    })

    expect(result.nonce).toBe(5n)
    expect(result.v).toBe(27)
    expect(result.r).toBe(`0x${rHex}`)
    expect(result.s).toBe(`0x${sHex}`)
  })

  it('supports overriding the nonce for batched transaction requirements', async () => {
    const mockSigner = {
      signTypedData: vi.fn().mockResolvedValue(dummySignatureHex),
    }

    const result = await signERC20Permit({
      tokenAddress,
      owner,
      spender,
      value: 500n,
      chainId: 1,
      signer: mockSigner,
      tokenName: 'Custom Token',
      nonce: 42n, // Explicit nonce override
      deadline: 1800000000n,
    })

    expect(mockSigner.signTypedData).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          nonce: 42n,
          deadline: 1800000000n,
        }),
      })
    )

    expect(result.nonce).toBe(42n)
    expect(result.deadline).toBe(1800000000n)
  })

  it('supports Ethers v5 _signTypedData fallback', async () => {
    const mockSigner = {
      _signTypedData: vi.fn().mockResolvedValue(dummySignatureHex),
    }

    const result = await signERC20Permit({
      tokenAddress,
      owner,
      spender,
      value: 100n,
      chainId: 1,
      signer: mockSigner,
      nonce: 0n,
    })

    expect(mockSigner._signTypedData).toHaveBeenCalled()
    expect(result.v).toBe(27)
  })
})
