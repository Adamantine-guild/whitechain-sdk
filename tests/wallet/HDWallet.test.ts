import { describe, expect, it } from 'vitest'
import { HDWallet, createHDWallet } from '../../src/wallet/HDWallet.js'
import { WhiteChainError } from '../../src/types.js'

describe('HDWallet (BIP-39 & BIP-44 key derivation)', () => {
  // Standard MetaMask / Anvil 12-word test seed phrase
  const metaMaskMnemonic = 'test test test test test test test test test test test junk'

  it('restores standard MetaMask mnemonic generating identical checksummed addresses (Acceptance Criteria)', () => {
    const wallet = new HDWallet(metaMaskMnemonic)

    // Index 0: m/44'/60'/0'/0/0 -> 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
    expect(wallet.getAddress(0)).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')

    // Index 1: m/44'/60'/0'/0/1 -> 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
    expect(wallet.getAddress(1)).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')

    // Index 2: m/44'/60'/0'/0/2 -> 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
    expect(wallet.getAddress(2)).toBe('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC')
  });

  it('derives valid viem HDAccount signers with signing capabilities', async () => {
    const wallet = createHDWallet(metaMaskMnemonic)
    const account = wallet.getAccount()

    expect(account.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
    expect(account.type).toBe('local')

    const message = 'Hello WhiteChain'
    const signature = await account.signMessage({ message })
    expect(signature).toMatch(/^0x[a-fA-F0-9]+$/)
  });

  it('supports custom derivation path overrides', () => {
    const wallet = new HDWallet(metaMaskMnemonic)
    const account = wallet.deriveAccount(0, "m/44'/60'/0'/0/5")

    expect(account.address).toMatch(/^0x[a-fA-F0-9]{40}$/)
    expect(account.address).not.toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
  });

  it('throws WhiteChainError for invalid mnemonic word count', () => {
    expect(() => new HDWallet('invalid mnemonic phrase')).toThrow(WhiteChainError)
    expect(() => new HDWallet('invalid mnemonic phrase')).toThrow(/Invalid mnemonic word count/)
  });

  it('securely wipes mnemonic from memory and prevents post-wipe key derivation', () => {
    const wallet = new HDWallet(metaMaskMnemonic)
    expect(wallet.isWiped()).toBe(false)
    expect(wallet.getAddress(0)).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')

    wallet.wipe()

    expect(wallet.isWiped()).toBe(true)
    expect(() => wallet.getAddress(0)).toThrow(WhiteChainError)
    expect(() => wallet.getAddress(0)).toThrow(/HDWallet memory has been wiped/)
    expect(() => wallet.deriveAccount(0)).toThrow(/HDWallet memory has been wiped/)
    expect(() => wallet.getAccount()).toThrow(/HDWallet memory has been wiped/)
  });
})
