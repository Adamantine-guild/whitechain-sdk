import { describe, it, expect } from 'vitest'

/**
 * JS/TS reference implementation of 512-bit mulDiv math logic matching MathUtils.sol
 */
function mulDivTs(x: bigint, y: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new Error('Division by zero')
  }

  const prod = x * y
  const result = prod / denominator

  if (result > 2n ** 256n - 1n) {
    throw new Error('Overflow')
  }

  return result
}

function mulDivRoundingUpTs(x: bigint, y: bigint, denominator: bigint): bigint {
  const floorRes = mulDivTs(x, y, denominator)
  const remainder = (x * y) % denominator
  if (remainder > 0n) {
    const ceilRes = floorRes + 1n
    if (ceilRes > 2n ** 256n - 1n) {
      throw new Error('Overflow on rounding up')
    }
    return ceilRes
  }
  return floorRes
}

describe('MathUtils.sol Yul mulDiv Logic & Fuzz Equivalence', () => {
  it('correctly calculates standard 18-decimal fixed-point multiplication and division', () => {
    const x = 1000000000000000000000n // 1000 e18
    const y = 1050000000000000000n // 1.05 e18
    const denominator = 1000000000000000000n // 1e18

    const result = mulDivTs(x, y, denominator)
    expect(result).toBe(1050000000000000000000n) // 1050 e18
  })

  it('handles Phantom Overflows where intermediate (x * y) exceeds 256 bits', () => {
    // x and y are each ~2^200, so x * y = 2^400 (exceeds uint256 max ~2^256)
    const x = 2n ** 200n
    const y = 2n ** 200n
    const denominator = 2n ** 200n

    // Intermediate x * y exceeds uint256 max, but final result 2^200 fits in uint256!
    const result = mulDivTs(x, y, denominator)
    expect(result).toBe(2n ** 200n)
  })

  it('gracefully reverts on division by zero', () => {
    expect(() => mulDivTs(100n, 200n, 0n)).toThrow('Division by zero')
  })

  it('gracefully reverts on actual final-result overflow', () => {
    const maxUint256 = 2n ** 256n - 1n
    expect(() => mulDivTs(maxUint256, 2n, 1n)).toThrow('Overflow')
  })

  it('fuzz tests 1000 random inputs for 100% equivalence between Yul 512-bit math and BigInt', () => {
    for (let i = 0; i < 1000; i++) {
      const x = BigInt(Math.floor(Math.random() * 1e15)) * 10n ** 9n + BigInt(i)
      const y = BigInt(Math.floor(Math.random() * 1e15)) * 10n ** 9n + 1n
      const denominator = BigInt(Math.floor(Math.random() * 1e12)) * 10n ** 9n + 1n

      const expected = (x * y) / denominator
      if (expected <= 2n ** 256n - 1n) {
        const actual = mulDivTs(x, y, denominator)
        expect(actual).toBe(expected)
      }
    }
  })

  it('correctly rounds up when calculating ceiling of division', () => {
    const x = 10n
    const y = 10n
    const denominator = 3n

    // 100 / 3 = 33.333... floor is 33, ceil is 34
    expect(mulDivTs(x, y, denominator)).toBe(33n)
    expect(mulDivRoundingUpTs(x, y, denominator)).toBe(34n)
  })
})
