/**
 * Formats raw SnarkJS Groth16 proof output into Solidity-compatible calldata.
 *
 * The standard Groth16 verifier contract expects:
 *   verifyProof(uint[2] pA, uint[2][2] pB, uint[2] pC, uint[] pubSignals)
 *
 * SnarkJS outputs BN254 curve points as decimal strings. This module converts
 * them to bigints and applies the coordinate reversal required for pB.
 */

import type { Groth16Proof, ProofCalldata } from './types.js'

/**
 * Converts a decimal string (as returned by SnarkJS) to a bigint.
 * Throws a descriptive error if the string is not a valid non-negative integer.
 */
function toUint256(value: string, field: string): bigint {
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(
      `ZK formatCalldata: expected a non-negative decimal integer for field "${field}", got: "${value}"`
    )
  }
  return BigInt(value.trim())
}

/**
 * Converts a raw SnarkJS Groth16 proof and public signals into the
 * exact `uint256` array structure required by the Solidity verifier.
 *
 * **Note on pB coordinate reversal:**
 * SnarkJS outputs BN254 G2 points as `[[x1, x0], [y1, y0], ...]` but the
 * EVM Groth16 verifier (based on the snarkjs `verifier.sol` template) expects
 * the coordinates in reversed order: `[[x0, x1], [y0, y1]]`.
 *
 * @param proof         Raw proof object from `snarkjs.groth16.fullProve`.
 * @param publicSignals Public signals array from `snarkjs.groth16.fullProve`.
 * @returns             On-chain ready `ProofCalldata`.
 *
 * @example
 * ```ts
 * const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey)
 * const calldata = formatCalldata(proof, publicSignals)
 * await verifier.verifyProof(calldata.pA, calldata.pB, calldata.pC, calldata.pubSignals)
 * ```
 */
export function formatCalldata(
  proof: Groth16Proof,
  publicSignals: string[]
): ProofCalldata {
  const pA: [bigint, bigint] = [
    toUint256(proof.pi_a[0], 'pi_a[0]'),
    toUint256(proof.pi_a[1], 'pi_a[1]'),
  ]

  // BN254 convention: G2 point coordinates are reversed for the EVM verifier
  const pB: [[bigint, bigint], [bigint, bigint]] = [
    [toUint256(proof.pi_b[0][1], 'pi_b[0][1]'), toUint256(proof.pi_b[0][0], 'pi_b[0][0]')],
    [toUint256(proof.pi_b[1][1], 'pi_b[1][1]'), toUint256(proof.pi_b[1][0], 'pi_b[1][0]')],
  ]

  const pC: [bigint, bigint] = [
    toUint256(proof.pi_c[0], 'pi_c[0]'),
    toUint256(proof.pi_c[1], 'pi_c[1]'),
  ]

  const pubSignals: bigint[] = publicSignals.map((s, i) =>
    toUint256(s, `publicSignals[${i}]`)
  )

  return { pA, pB, pC, pubSignals }
}
