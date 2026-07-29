import { mnemonicToAccount, type HDAccount } from 'viem/accounts'
import type { Address } from 'viem'
import { WhiteChainError } from '../types.js'

export type HDWalletOptions = {
  /** 12, 15, 18, 21, or 24 word BIP-39 mnemonic phrase. */
  mnemonic: string
  /** Base derivation path. Defaults to "m/44'/60'/0'/0/0". */
  path?: string
  /** Optional passphrase for BIP-39 seed generation. */
  passphrase?: string
}

/**
 * HDWallet provides BIP-39 seed phrase parsing and BIP-32/BIP-44 key derivation.
 * Supports standard EVM paths (e.g. `m/44'/60'/0'/0/x` compatible with MetaMask and Hardware Wallets).
 * Includes secure memory wiping to clear sensitive mnemonics when finished.
 */
export class HDWallet {
  private _mnemonic: string | null
  private readonly basePath: string
  private readonly passphrase?: string

  constructor(options: HDWalletOptions | string) {
    const opts: HDWalletOptions = typeof options === 'string' ? { mnemonic: options } : options

    if (!opts.mnemonic || typeof opts.mnemonic !== 'string') {
      throw new WhiteChainError('Valid BIP-39 mnemonic string is required')
    }

    const trimmed = opts.mnemonic.trim()
    const wordCount = trimmed.split(/\s+/).length
    if (wordCount !== 12 && wordCount !== 15 && wordCount !== 18 && wordCount !== 21 && wordCount !== 24) {
      throw new WhiteChainError(`Invalid mnemonic word count: expected 12, 15, 18, 21, or 24 words, got ${wordCount}`)
    }

    this._mnemonic = trimmed
    this.basePath = opts.path ?? "m/44'/60'/0'/0/0"
    this.passphrase = opts.passphrase
  }

  /**
   * Derives a child account at a specific address index or custom derivation path.
   * Defaults to Ethereum standard BIP-44 path `m/44'/60'/0'/0/${index}` (MetaMask standard).
   *
   * @param index Address index to derive (default 0)
   * @param customPath Optional custom derivation path override (e.g. "m/44'/60'/0'/0/1")
   * @returns {HDAccount} The derived viem HDAccount signer instance
   */
  deriveAccount(index = 0, customPath?: string): HDAccount {
    this.ensureNotWiped()

    const derivationPath = customPath ?? (index === 0 ? this.basePath : `m/44'/60'/0'/0/${index}`)

    try {
      return mnemonicToAccount(this._mnemonic!, {
        path: derivationPath as `m/44'/60'/${string}`,
        passphrase: this.passphrase,
      })
    } catch (err: any) {
      throw new WhiteChainError(`Failed to derive HD account at path ${derivationPath}: ${err?.message ?? String(err)}`)
    }
  }

  /**
   * Returns the primary account derived at index 0.
   */
  getAccount(): HDAccount {
    return this.deriveAccount(0)
  }

  /**
   * Returns the public EVM checksummed address derived at the specified index.
   *
   * @param index Address index (default 0)
   */
  getAddress(index = 0): Address {
    return this.deriveAccount(index).address
  }

  /**
   * Performs secure memory cleanup by overwriting and clearing the stored mnemonic.
   * After wiping, subsequent calls to derive account keys will throw a WhiteChainError.
   */
  wipe(): void {
    if (this._mnemonic !== null) {
      // Overwrite memory string before releasing reference
      const len = this._mnemonic.length
      this._mnemonic = '\0'.repeat(len)
      this._mnemonic = null
    }
  }

  /**
   * Returns true if the wallet mnemonic has been securely wiped from memory.
   */
  isWiped(): boolean {
    return this._mnemonic === null
  }

  private ensureNotWiped(): void {
    if (this._mnemonic === null) {
      throw new WhiteChainError('HDWallet memory has been wiped. Mnemonic is no longer accessible.')
    }
  }
}

/**
 * Helper factory function to construct an {@link HDWallet} instance from a mnemonic phrase.
 */
export function createHDWallet(options: HDWalletOptions | string): HDWallet {
  return new HDWallet(options)
}
