/**
 * Commonly used addresses and simple validation helpers.
 * All addresses are exported as lower‑case checksummed strings.
 */

/** Zero address – the address consisting of all zeros. */
export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000' as const

/**
 * Precompile contract addresses (Ethereum style). These are the well‑known addresses
 * for built‑in system contracts. Exported as a record for easy lookup.
 */
export const PRECOMPILE_ADDRESSES = {
  EC_RECOVERY: '0x0000000000000000000000000000000000000001',
  SHA256: '0x0000000000000000000000000000000000000002',
  RIPEMD160: '0x0000000000000000000000000000000000000003',
  IDENTITY: '0x0000000000000000000000000000000000000004',
  MOD_EXP: '0x0000000000000000000000000000000000000005',
  BN256_ADD: '0x0000000000000000000000000000000000000006',
  BN256_SCALAR_MUL: '0x0000000000000000000000000000000000000007',
  BN256_PAIRING: '0x0000000000000000000000000000000000000008',
  BLAKE2F: '0x0000000000000000000000000000000000000009',
} as const

/**
 * Simple runtime validation for an Ethereum address.
 * Returns true if the string matches the 0x-prefixed 40‑hex‑character format.
 */
export function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address)
}

/**
 * Guard that throws if an address is invalid. Helpful for early failures.
 */
export function assertValidAddress(address: string, name = 'address'): void {
  if (!isValidAddress(address)) {
    throw new Error(`${name} is not a valid 20‑byte hex address: ${address}`)
  }
}
