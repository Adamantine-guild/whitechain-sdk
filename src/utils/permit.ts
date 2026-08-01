import type { Address } from 'viem'
import { WhiteChainError } from '../types.js'

export interface PermitTypes {
  Permit: Array<{ name: string; type: string }>
}

export const EIP2612_PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const satisfies PermitTypes

export interface EIP2612Domain {
  name: string
  version?: string
  chainId: number | bigint
  verifyingContract: Address
}

export interface SignERC20PermitOptions {
  tokenAddress: Address
  owner: Address
  spender: Address
  value: bigint
  deadline?: bigint
  chainId: number | bigint
  signer: any // Viem WalletClient, Ethers Signer, or EIP-1193 Provider
  publicClient?: any // Optional PublicClient to fetch nonce/name if not provided
  tokenName?: string
  tokenVersion?: string
  nonce?: bigint
}

export interface ERC20PermitSignature {
  v: number
  r: `0x${string}`
  s: `0x${string}`
  signature: `0x${string}`
  deadline: bigint
  nonce: bigint
}

/**
 * Helper function to split a 65-byte hex signature into v, r, s components.
 */
export function splitSignature(signature: `0x${string}`): { v: number; r: `0x${string}`; s: `0x${string}` } {
  const cleanSig = signature.startsWith('0x') ? signature.slice(2) : signature
  if (cleanSig.length !== 130) {
    throw new WhiteChainError(`Invalid signature length (${cleanSig.length}). Expected 130 hex chars (65 bytes).`)
  }

  const r = `0x${cleanSig.slice(0, 64)}` as `0x${string}`
  const s = `0x${cleanSig.slice(64, 128)}` as `0x${string}`
  let v = parseInt(cleanSig.slice(128, 130), 16)

  // Handle standard ECDSA v normalization (27/28)
  if (v < 27) {
    v += 27
  }

  return { v, r, s }
}

/**
 * Generates an EIP-712 ERC-20 Permit signature using a connected wallet client or signer.
 *
 * Automatically fetches token `name` and `nonces(owner)` if not explicitly provided,
 * structures the EIP-712 domain separator and typed data, prompts the user's wallet,
 * and returns the split signature (v, r, s) ready for on-chain submission.
 */
export async function signERC20Permit(options: SignERC20PermitOptions): Promise<ERC20PermitSignature> {
  const {
    tokenAddress,
    owner,
    spender,
    value,
    chainId,
    signer,
    publicClient,
    tokenName: customName,
    tokenVersion = '1',
    nonce: customNonce,
    deadline: customDeadline,
  } = options

  if (!tokenAddress) throw new WhiteChainError('tokenAddress is required for signERC20Permit')
  if (!owner) throw new WhiteChainError('owner address is required for signERC20Permit')
  if (!spender) throw new WhiteChainError('spender address is required for signERC20Permit')
  if (!signer) throw new WhiteChainError('signer is required for signERC20Permit')

  // Set default deadline to 1 hour from now if not specified
  const deadline = customDeadline ?? BigInt(Math.floor(Date.now() / 1000) + 3600)

  // Fetch token name if not provided
  let tokenName = customName
  if (!tokenName) {
    if (publicClient && typeof publicClient.readContract === 'function') {
      try {
        tokenName = (await publicClient.readContract({
          address: tokenAddress,
          abi: [{ name: 'name', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] }],
          functionName: 'name',
        })) as string
      } catch {
        tokenName = 'Whitelotus'
      }
    } else {
      tokenName = 'Whitelotus'
    }
  }

  // Fetch owner nonce from contract if not provided (supports override for batched transactions)
  let nonce = customNonce
  if (nonce === undefined) {
    if (publicClient && typeof publicClient.readContract === 'function') {
      try {
        nonce = (await publicClient.readContract({
          address: tokenAddress,
          abi: [{ name: 'nonces', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }],
          functionName: 'nonces',
          args: [owner],
        })) as bigint
      } catch {
        nonce = 0n
      }
    } else {
      nonce = 0n
    }
  }

  const domain: EIP2612Domain = {
    name: tokenName,
    version: tokenVersion,
    chainId: Number(chainId),
    verifyingContract: tokenAddress,
  }

  const message = {
    owner,
    spender,
    value,
    nonce,
    deadline,
  }

  let signatureHex: `0x${string}`

  // Prompt signer (supports viem WalletClient, ethers v5/v6, and standard EIP-712 signers)
  if (typeof signer.signTypedData === 'function') {
    signatureHex = await signer.signTypedData({
      account: owner,
      domain,
      types: EIP2612_PERMIT_TYPES,
      primaryType: 'Permit',
      message,
    })
  } else if (typeof signer._signTypedData === 'function') {
    // Ethers v5 fallback
    signatureHex = await signer._signTypedData(domain, EIP2612_PERMIT_TYPES, message)
  } else if (typeof signer.request === 'function') {
    // EIP-1193 provider fallback (eth_signTypedData_v4)
    const dataToSign = JSON.stringify({
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        ...EIP2612_PERMIT_TYPES,
      },
      domain,
      primaryType: 'Permit',
      message: {
        ...message,
        value: value.toString(),
        nonce: nonce.toString(),
        deadline: deadline.toString(),
      },
    })
    signatureHex = (await signer.request({
      method: 'eth_signTypedData_v4',
      params: [owner, dataToSign],
    })) as `0x${string}`
  } else {
    throw new WhiteChainError('Signer does not support signTypedData, _signTypedData, or eth_signTypedData_v4')
  }

  const { v, r, s } = splitSignature(signatureHex)

  return {
    v,
    r,
    s,
    signature: signatureHex,
    deadline,
    nonce,
  }
}
