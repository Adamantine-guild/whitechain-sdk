import { ValidationError } from '../errors/index.js'

/**
 * Utility functions for formatting and parsing big integer token amounts.
 * These functions avoid floating point arithmetic to retain full precision.
 */

/**
 * Convert a bigint value representing the smallest token unit into a human‑readable string.
 *
 * @param value   The amount in the smallest unit (e.g., wei).
 * @param decimals Number of decimal places the token uses (e.g., 18 for Ether).
 * @returns A string representation with a decimal point. At least one fractional digit is kept.
 *
 * Example: formatUnits(1000000000000000000n, 18) => "1.0"
 */
export function formatUnits(value: bigint, decimals: number): string {
  if (decimals < 0) throw new ValidationError('decimals must be non‑negative')
  const raw = value.toString(10)
  
  const isNegative = raw.startsWith('-')
  const absRaw = isNegative ? raw.slice(1) : raw

  // Ensure the string has enough digits to place the decimal point.
  const padded = absRaw.padStart(decimals + 1, '0')
  const integerPart = padded.slice(0, -decimals) || '0'
  const fractionalPart = padded.slice(-decimals)
  
  // Trim trailing zeros but keep at least one digit.
  const trimmedFraction = fractionalPart.replace(/0+$/g, '') || '0'
  
  const formatted = `${integerPart}.${trimmedFraction}`
  return isNegative ? `-${formatted}` : formatted
}

/**
 * Parse a human‑readable token amount into its smallest unit as a bigint.
 *
 * @param value    String representation, may contain a decimal point.
 * @param decimals Number of decimal places the token uses.
 * @returns The amount in the smallest unit as bigint.
 *
 * Example: parseUnits('1.0', 18) => 1000000000000000000n
 */
export function parseUnits(value: string, decimals: number): bigint {
  if (decimals < 0) throw new ValidationError('decimals must be non‑negative')
  if (!value) throw new ValidationError('value must be a non‑empty string')
  
  const isNegative = value.startsWith('-')
  const absValue = isNegative ? value.slice(1) : value

  const [intPart = '0', fracPart = ''] = absValue.split('.')
  // Remove any leading zeros from integer part for consistency.
  const cleanInt = intPart.replace(/^0+(?=\d)/, '') || '0'
  // Pad or truncate the fractional part to the required decimals.
  const cleanFrac = (fracPart + '0'.repeat(decimals)).slice(0, decimals)
  const combined = cleanInt + cleanFrac
  
  const result = BigInt(combined)
  return isNegative ? -result : result
}
