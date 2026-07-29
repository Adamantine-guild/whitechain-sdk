import { validateStakingInput, type ValidationResult } from '../../utils/validation.js'
import { formatUnits } from '../../utils/math.js'

export interface StakingFormProps {
  userBalance: bigint
  decimals?: number
  tokenSymbol?: string
  amount: string
  onAmountChange: (amount: string) => void
  onStake?: (amount: bigint) => Promise<void>
  disabled?: boolean
  isSubmitting?: boolean
}

export interface FormattedStakingState extends ValidationResult {
  isButtonDisabled: boolean
  formattedBalance: string
}

/**
 * Client-side validated StakingForm helper component & controller logic.
 *
 * Validates input against balance and decimal precision, disables action button
 * with low opacity when input is invalid or unaffordable, displays explicit error text,
 * and updates button text ("Enter Amount", "Insufficient Balance", "Stake Tokens").
 */
export function StakingForm(
  amount: string,
  userBalance: bigint,
  decimals = 18,
  tokenSymbol = 'WTC'
): FormattedStakingState {
  const validation = validateStakingInput(amount, {
    userBalance,
    decimals,
    symbol: tokenSymbol,
  })

  return {
    ...validation,
    isButtonDisabled: !validation.isValid,
    formattedBalance: `${formatUnits(userBalance, decimals)} ${tokenSymbol}`,
  }
}

/**
 * Clean input handler that prevents typing non-numeric/alphabetical characters.
 */
export function handleStakingInputChange(
  input: string,
  callback: (val: string) => void
) {
  if (input === '' || /^\d*\.?\d*$/.test(input)) {
    callback(input)
  }
}
