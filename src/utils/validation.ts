import { parseUnits, formatUnits } from './math.js'

export interface StakingValidationOptions {
  userBalance: bigint
  decimals?: number
  symbol?: string
}

export interface ValidationResult {
  isValid: boolean
  buttonText: string
  errorMessage?: string
  parsedAmount?: bigint
}

/**
 * Validates a staking input string against the user's token balance and decimal precision.
 *
 * Checks:
 * 1. Empty or zero input -> buttonText: "Enter Amount"
 * 2. Non-numeric / alphabetical characters -> buttonText: "Invalid Number Format"
 * 3. Decimal places > token decimal precision -> buttonText: "Max X Decimals Allowed"
 * 4. Amount > userBalance -> buttonText: "Insufficient Balance"
 *
 * Returns isValid boolean, explicit button text, error message, and parsed BigInt amount.
 */
export function validateStakingInput(
  input: string,
  options: StakingValidationOptions
): ValidationResult {
  const { userBalance, decimals = 18 } = options

  const trimmed = input.trim()

  if (!trimmed || trimmed === '0' || /^0+(\.0+)?$/.test(trimmed)) {
    return {
      isValid: false,
      buttonText: 'Enter Amount',
    }
  }

  // Prevent non-numeric/alphabetical input (only digits and a single optional decimal point allowed)
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return {
      isValid: false,
      buttonText: 'Invalid Number Format',
      errorMessage: 'Please enter a valid positive number.',
    }
  }

  // Check decimal precision limit
  const decimalParts = trimmed.split('.')
  if (decimalParts.length === 2 && decimalParts[1].length > decimals) {
    return {
      isValid: false,
      buttonText: `Max ${decimals} Decimals Allowed`,
      errorMessage: `Amount cannot exceed ${decimals} decimal places.`,
    }
  }

  try {
    const parsedAmount = parseUnits(trimmed, decimals)

    if (parsedAmount <= 0n) {
      return {
        isValid: false,
        buttonText: 'Enter Amount',
      }
    }

    if (parsedAmount > userBalance) {
      return {
        isValid: false,
        buttonText: 'Insufficient Balance',
        errorMessage: `Amount exceeds your balance of ${formatUnits(userBalance, decimals)}.`,
        parsedAmount,
      }
    }

    return {
      isValid: true,
      buttonText: 'Stake Tokens',
      parsedAmount,
    }
  } catch {
    return {
      isValid: false,
      buttonText: 'Invalid Input',
      errorMessage: 'Could not parse input amount.',
    }
  }
}
