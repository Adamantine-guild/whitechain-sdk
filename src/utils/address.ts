/**
 * EIP-55 address checksum utilities.
 *
 * Validates and formats Ethereum addresses to their checksummed form using
 * the keccak256-based algorithm defined in EIP-55. Sending funds to a
 * wrong address is an irreversible mistake — checksum validation catches
 * typos before they reach the network.
 *
 * @see https://eips.ethereum.org/EIPS/eip-55
 */

import { keccak256, toBytes } from 'viem'
import { ValidationError } from '../errors/index.js'

/**
 * Converts a hex address to its EIP-55 mixed-case checksum form.
 *
 * Algorithm (EIP-55):
 *  1. Lowercase the address (strip 0x prefix).
 *  2. keccak256-hash that lowercase string (as UTF-8 bytes).
 *  3. For each character in the address:
 *     - If it is a hex letter (a–f) AND the corresponding nibble of the hash is >= 8 → uppercase it.
 *     - Otherwise → keep it lowercase.
 *  4. Prepend '0x'.
 *
 * @throws {ValidationError} if the input is not a structurally valid 20-byte hex address.
 */
export function toChecksumAddress(address: string): string {
  if (!/^(0x)?[0-9a-fA-F]{40}$/.test(address)) {
    throw new ValidationError(`Invalid address format: ${address}`)
  }

  const stripped = address.toLowerCase().replace(/^0x/, '')

  // keccak256 over the UTF-8 bytes of the lowercase hex string (no 0x prefix)
  const hashHex = keccak256(toBytes(stripped)).slice(2) // remove leading '0x'

  let checksummed = '0x'
  for (let i = 0; i < 40; i++) {
    const char = stripped[i]
    // Only letters need case treatment; digits are always unchanged
    if (/[a-f]/.test(char) && parseInt(hashHex[i], 16) >= 8) {
      checksummed += char.toUpperCase()
    } else {
      checksummed += char
    }
  }

  return checksummed
}

/**
 * Returns `true` if the address is a correctly EIP-55 checksummed address.
 *
 * A purely lowercase or purely uppercase address (no mixed case) is treated as
 * having no checksum and will return `false` — matching standard tooling behaviour.
 * Pass mixed-case addresses to get meaningful validation.
 *
 * @example
 * isAddress('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed') // true
 * isAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed') // false (all lowercase)
 * isAddress('0xdeadbeef')                                 // false (too short)
 */
export function isAddress(address: string): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false

  const lower = address.toLowerCase()
  const upper = address.toUpperCase().replace('X', 'x') // preserve '0x'

  // A fully lowercase or fully uppercase address has no EIP-55 checksum
  if (address === lower || address === upper) return false

  try {
    return toChecksumAddress(address) === address
  } catch {
    return false
  }
}

/**
 * Guard that throws a `ValidationError` if the address fails EIP-55 validation.
 * Use this at SDK entry points to reject bad addresses early.
 *
 * @throws {ValidationError}
 */
export function assertChecksumAddress(address: string, name = 'address'): void {
  if (!isAddress(address)) {
    throw new ValidationError(
      `${name} is not a valid EIP-55 checksummed address: ${address}. ` +
      `Expected form: ${tryChecksum(address)}`
    )
  }
}

/** Internal helper — returns the checksum or a fallback string if the input is malformed. */
function tryChecksum(address: string): string {
  try {
    return toChecksumAddress(address)
  } catch {
    return '<invalid address>'
  }
}
