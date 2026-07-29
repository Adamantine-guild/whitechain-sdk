import { describe, expect, it } from 'vitest'
import { formatBigIntToString } from '../../src/utils/formatters.js'

describe('formatBigIntToString', () => {
  it('converts deeply nested bigint values without losing precision', () => {
    const value = {
      amount: 90071992547409931234567890n,
      nested: {
        values: [1n, { balance: -2n }],
        label: 'unchanged',
      },
      optional: undefined,
      empty: null,
    }

    const formatted = formatBigIntToString(value)

    expect(formatted).toEqual({
      amount: '90071992547409931234567890',
      nested: {
        values: ['1', { balance: '-2' }],
        label: 'unchanged',
      },
      optional: undefined,
      empty: null,
    })
    expect(() => JSON.stringify(formatted)).not.toThrow()
  })

  it('returns primitive values unchanged', () => {
    expect(formatBigIntToString('whitechain')).toBe('whitechain')
    expect(formatBigIntToString(42)).toBe(42)
    expect(formatBigIntToString(false)).toBe(false)
  })
})
