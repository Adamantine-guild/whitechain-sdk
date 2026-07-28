// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MathUtils
 * @notice Highly optimized 512-bit multiplication and division math library written in pure Yul (inline assembly).
 * @dev Designed to handle phantom overflows where intermediate (x * y) exceeds 256 bits but the final
 * quotient (x * y) / denominator fits within 256 bits.
 */
library MathUtils {
    /**
     * @notice Calculates floor(x * y / denominator) with full 512-bit precision.
     * @dev Reverts if denominator is 0 or if the final result overflows uint256.
     * 
     * Mathematical & Bitwise Logic Breakdown for Auditors:
     * ----------------------------------------------------------------------------------
     * 1. 512-bit Multiplication:
     *    Let x * y = prod1 * 2^256 + prod0, where:
     *    - prod0 = x * y (mod 2^256) [computed via Yul `mul(x, y)`]
     *    - prod1 = (x * y) / 2^256    [computed via `mulmod` and 2's complement subtraction]
     *
     * 2. Overflow Bounds & Reverts:
     *    - Reverts with Panic(0x12) if denominator is 0.
     *    - If prod1 == 0, intermediate x * y fits in 256 bits, so return prod0 / denominator.
     *    - Reverts with Panic(0x11) if prod1 >= denominator, because quotient >= 2^256 (overflow).
     *
     * 3. Phantom Overflow Resolution (512-bit / 256-bit Division):
     *    - Subtract remainder (mulmod(x, y, denominator)) from [prod1 prod0] to make division exact.
     *    - Factor out largest power of two (twos) dividing denominator so denominator becomes odd (coprime to 2^256).
     *    - Shift [prod1 prod0] by twos.
     *    - Calculate Modular Inverse of odd denominator modulo 2^256 using Newton-Raphson iteration:
     *      inv_{n+1} = inv_n * (2 - denominator * inv_n) (mod 2^256).
     *    - Multiply 512-bit product by modular inverse to yield exact 256-bit result.
     * ----------------------------------------------------------------------------------
     *
     * @param x Multiplicand
     * @param y Multiplier
     * @param denominator Divisor
     * @return result The floor of (x * y) / denominator
     */
    function mulDiv(
        uint256 x,
        uint256 y,
        uint256 denominator
    ) internal pure returns (uint256 result) {
        assembly {
            // -----------------------------------------------------------------
            // STEP 1: 512-bit Multiplication [prod1 prod0] = x * y
            // -----------------------------------------------------------------
            let prod0 := mul(x, y)
            let mm := mulmod(x, y, 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff)
            let prod1 := sub(sub(mm, prod0), lt(mm, prod0))

            // -----------------------------------------------------------------
            // STEP 2: Division by Zero Guard
            // -----------------------------------------------------------------
            if iszero(denominator) {
                // Revert with standard Panic(0x12) for Division by Zero
                mstore(0x00, 0x4e487b7100000000000000000000000000000000000000000000000000000000)
                mstore(0x04, 0x12)
                revert(0x00, 0x24)
            }

            // -----------------------------------------------------------------
            // STEP 3: Handle Non-Overflowing Case (Fast Path)
            // -----------------------------------------------------------------
            if iszero(prod1) {
                result := div(prod0, denominator)
            }

            // -----------------------------------------------------------------
            // STEP 4: Handle Phantom Overflow (512-bit Division)
            // -----------------------------------------------------------------
            if iszero(iszero(prod1)) {
                // Ensure result < 2^256. If prod1 >= denominator, result >= 2^256 (overflow).
                if iszero(gt(denominator, prod1)) {
                    // Revert with standard Panic(0x11) for Arithmetic Overflow
                    mstore(0x00, 0x4e487b7100000000000000000000000000000000000000000000000000000000)
                    mstore(0x04, 0x11)
                    revert(0x00, 0x24)
                }

                // Subtract remainder from [prod1 prod0] to make division exact
                let remainder := mulmod(x, y, denominator)
                prod1 := sub(prod1, gt(remainder, prod0))
                prod0 := sub(prod0, remainder)

                // Compute largest power of 2 factor dividing denominator (twos)
                let twos := and(denominator, add(not(denominator), 1))

                // Divide denominator by twos so denominator becomes odd
                denominator := div(denominator, twos)

                // Divide prod0 by twos
                prod0 := div(prod0, twos)

                // Shift prod1 by (256 - k) bits where twos = 2^k
                let twos_shift := add(div(sub(0, twos), twos), 1)
                prod1 := mul(prod1, twos_shift)
                prod0 := or(prod0, prod1)

                // Invert denominator modulo 2^256 using Newton-Raphson iteration
                let inv := mul(3, denominator)
                inv := mul(inv, sub(2, mul(denominator, inv)))
                inv := mul(inv, sub(2, mul(denominator, inv)))
                inv := mul(inv, sub(2, mul(denominator, inv)))
                inv := mul(inv, sub(2, mul(denominator, inv)))
                inv := mul(inv, sub(2, mul(denominator, inv)))
                inv := mul(inv, sub(2, mul(denominator, inv)))

                // Compute exact 256-bit quotient result
                result := mul(prod0, inv)
            }
        }
    }

    /**
     * @notice Calculates ceil(x * y / denominator) with 512-bit precision.
     * @param x Multiplicand
     * @param y Multiplier
     * @param denominator Divisor
     * @return result The ceiling of (x * y) / denominator
     */
    function mulDivRoundingUp(
        uint256 x,
        uint256 y,
        uint256 denominator
    ) internal pure returns (uint256 result) {
        result = mulDiv(x, y, denominator);
        if (mulmod(x, y, denominator) > 0) {
            require(result < type(uint256).max, "MathUtils: overflow on rounding up");
            unchecked {
                result += 1;
            }
        }
    }
}
