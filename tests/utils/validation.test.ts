import { describe, it, expect } from 'vitest'
import { validateStakingInput } from '../../src/utils/validation.js'
import { parseUnits } from '../../src/utils/math.js'

describe('Staking Input Validation (validateStakingInput)', () => {
  const userBalance = parseUnits('100', 18) // 100 WTC

  it('returns "Enter Amount" if input is empty or zero', () => {
    expect(validateStakingInput('', { userBalance })).toEqual({
      isValid: false,
      buttonText: 'Enter Amount',
    })

    expect(validateStakingInput('0', { userBalance })).toEqual({
      isValid: false,
      buttonText: 'Enter Amount',
    })

    expect(validateStakingInput('0.000', { userBalance })).toEqual({
      isValid: false,
      buttonText: 'Enter Amount',
    })
  })

  it('returns "Insufficient Balance" if user inputs more than they own', () => {
    const res = validateStakingInput('150', { userBalance })
    expect(res.isValid).toBe(false)
    expect(res.buttonText).toBe('Insufficient Balance')
    expect(res.errorMessage).toContain('Amount exceeds your balance of 100')
  })

  it('returns "Invalid Number Format" if input contains alphabetical or invalid characters', () => {
    const res = validateStakingInput('100abc', { userBalance })
    expect(res.isValid).toBe(false)
    expect(res.buttonText).toBe('Invalid Number Format')
  })

  it('returns "Max 18 Decimals Allowed" if input exceeds token decimal precision', () => {
    const res = validateStakingInput('1.1234567890123456789', { userBalance, decimals: 18 })
    expect(res.isValid).toBe(false)
    expect(res.buttonText).toBe('Max 18 Decimals Allowed')
  })

  it('returns isValid: true and buttonText: "Stake Tokens" when input is valid and affordable', () => {
    const res = validateStakingInput('50.5', { userBalance })
    expect(res.isValid).toBe(true)
    expect(res.buttonText).toBe('Stake Tokens')
    expect(res.parsedAmount).toBe(parseUnits('50.5', 18))
  })
})
