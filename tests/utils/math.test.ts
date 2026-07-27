import { describe, it, expect } from 'vitest'
import { formatUnits, parseUnits } from '../../src/utils/math.js'

describe('formatUnits', () => {
  it('formats positive numbers correctly', () => {
    expect(formatUnits(1000000000000000000n, 18)).toBe('1.0')
    expect(formatUnits(1500000000000000000n, 18)).toBe('1.5')
    expect(formatUnits(10000000000n, 18)).toBe('0.00000001')
    expect(formatUnits(12345n, 2)).toBe('123.45')
  })

  it('formats zero correctly', () => {
    expect(formatUnits(0n, 18)).toBe('0.0')
    expect(formatUnits(0n, 0)).toBe('0.0')
  })

  it('formats negative numbers correctly', () => {
    expect(formatUnits(-1000000000000000000n, 18)).toBe('-1.0')
    expect(formatUnits(-1500000000000000000n, 18)).toBe('-1.5')
    expect(formatUnits(-10000000000n, 18)).toBe('-0.00000001')
    expect(formatUnits(-1n, 3)).toBe('-0.001')
  })

  it('throws an error for negative decimals', () => {
    expect(() => formatUnits(100n, -1)).toThrow('decimals must be non‑negative')
  })
})

describe('parseUnits', () => {
  it('parses positive strings correctly', () => {
    expect(parseUnits('1.0', 18)).toBe(1000000000000000000n)
    expect(parseUnits('1.5', 18)).toBe(1500000000000000000n)
    expect(parseUnits('0.00000001', 18)).toBe(10000000000n)
    expect(parseUnits('123.45', 2)).toBe(12345n)
  })

  it('parses zero correctly', () => {
    expect(parseUnits('0', 18)).toBe(0n)
    expect(parseUnits('0.0', 18)).toBe(0n)
    expect(parseUnits('000.000', 18)).toBe(0n)
  })

  it('parses negative strings correctly', () => {
    expect(parseUnits('-1.0', 18)).toBe(-1000000000000000000n)
    expect(parseUnits('-1.5', 18)).toBe(-1500000000000000000n)
    expect(parseUnits('-0.00000001', 18)).toBe(-10000000000n)
    expect(parseUnits('-1', 3)).toBe(-1000n)
  })

  it('handles strings without integer parts', () => {
    expect(parseUnits('.5', 18)).toBe(500000000000000000n)
    expect(parseUnits('-.5', 18)).toBe(-500000000000000000n)
  })

  it('handles strings with multiple leading zeros', () => {
    expect(parseUnits('0001.5', 18)).toBe(1500000000000000000n)
    expect(parseUnits('-0001.5', 18)).toBe(-1500000000000000000n)
  })

  it('throws an error for negative decimals', () => {
    expect(() => parseUnits('1.0', -1)).toThrow('decimals must be non‑negative')
  })

  it('throws an error for empty strings', () => {
    expect(() => parseUnits('', 18)).toThrow('value must be a non‑empty string')
  })
})
