import type { Address, Hex } from 'viem'

/**
 * Pad a 20-byte address to a 32-byte topic (left-zero-padded), as used in
 * indexed event parameters for eth_getLogs filters.
 */
export function padAddressTopic(address: Address | string): Hex {
  const hex = address.toLowerCase().replace(/^0x/, '')
  if (!/^[0-9a-f]{40}$/.test(hex)) {
    throw new Error(`Invalid address for topic padding: ${address}`)
  }
  return `0x${'0'.repeat(24)}${hex}` as Hex
}
