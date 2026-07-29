import { describe, it, expect } from 'vitest'
import { formatCalldata } from '../../src/zk/format.js'
import type { Groth16Proof } from '../../src/zk/types.js'

// Reference proof from the snarkjs documentation / verifier template
const MOCK_PROOF: Groth16Proof = {
  pi_a: [
    '7064994015026294289480764315691672484348282082441831098499455698703086695104',
    '5768380490009591965218680048706929717064193891070000978893447045648766361592',
    '1',
  ],
  pi_b: [
    [
      '20166804560038097178592891483823177914064613978044396696671063720944773413440',
      '11394745025082948021977082200396049441448785697093406296741891019879126866752',
    ],
    [
      '9043524893956714461073424929820965406991649742888524254773936978700754578560',
      '16406086580024474698887534600421987748428099455898213810668756023820456447232',
    ],
    ['1', '0'],
  ],
  pi_c: [
    '12847498867019985671640624588148866561428688897024175843547272278456131952640',
    '21803027831866831490028025461447553454384685001462965649977085897748558680064',
    '1',
  ],
  protocol: 'groth16',
  curve: 'bn128',
}

const MOCK_SIGNALS = ['1', '2']

describe('formatCalldata', () => {
  it('produces bigint values for pA', () => {
    const calldata = formatCalldata(MOCK_PROOF, MOCK_SIGNALS)
    expect(typeof calldata.pA[0]).toBe('bigint')
    expect(typeof calldata.pA[1]).toBe('bigint')
    expect(calldata.pA[0]).toBe(
      BigInt('7064994015026294289480764315691672484348282082441831098499455698703086695104')
    )
  })

  it('reverses pB G2 coordinates for BN254 / EVM convention', () => {
    const calldata = formatCalldata(MOCK_PROOF, MOCK_SIGNALS)
    // pi_b[0] = [x1, x0] in SnarkJS → pB[0] = [x0, x1] in calldata
    expect(calldata.pB[0][0]).toBe(BigInt(MOCK_PROOF.pi_b[0][1]))
    expect(calldata.pB[0][1]).toBe(BigInt(MOCK_PROOF.pi_b[0][0]))
    expect(calldata.pB[1][0]).toBe(BigInt(MOCK_PROOF.pi_b[1][1]))
    expect(calldata.pB[1][1]).toBe(BigInt(MOCK_PROOF.pi_b[1][0]))
  })

  it('produces bigint values for pC', () => {
    const calldata = formatCalldata(MOCK_PROOF, MOCK_SIGNALS)
    expect(typeof calldata.pC[0]).toBe('bigint')
    expect(typeof calldata.pC[1]).toBe('bigint')
  })

  it('converts pubSignals to bigints', () => {
    const calldata = formatCalldata(MOCK_PROOF, MOCK_SIGNALS)
    expect(calldata.pubSignals).toEqual([1n, 2n])
  })

  it('handles a large pubSignals array', () => {
    const signals = Array.from({ length: 10 }, (_, i) => String(i * 1000))
    const calldata = formatCalldata(MOCK_PROOF, signals)
    expect(calldata.pubSignals).toHaveLength(10)
    expect(calldata.pubSignals[9]).toBe(9000n)
  })

  it('throws on non-numeric proof values', () => {
    const badProof = { ...MOCK_PROOF, pi_a: ['not-a-number', '1', '1'] as [string, string, string] }
    expect(() => formatCalldata(badProof, MOCK_SIGNALS)).toThrow(
      'expected a non-negative decimal integer'
    )
  })

  it('throws on non-numeric public signal', () => {
    expect(() => formatCalldata(MOCK_PROOF, ['1', 'bad'])).toThrow(
      'expected a non-negative decimal integer'
    )
  })
})
