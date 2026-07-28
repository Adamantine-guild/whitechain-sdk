// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../contracts/libraries/MathUtils.sol";
import "../contracts/Vault.sol";

/**
 * @title MathUtilsTest
 * @notice Forge / Solidity test suite for MathUtils.sol Yul mulDiv implementation.
 */
contract MathUtilsTest {
    function testStandardMulDiv() public pure {
        uint256 x = 1000 * 1e18;
        uint256 y = 1050000000000000000; // 1.05 e18
        uint256 denominator = 1e18;

        uint256 result = MathUtils.mulDiv(x, y, denominator);
        require(result == 1050 * 1e18, "Standard mulDiv failed");
    }

    function testPhantomOverflow() public pure {
        uint256 x = 2**200;
        uint256 y = 2**200;
        uint256 denominator = 2**200;

        uint256 result = MathUtils.mulDiv(x, y, denominator);
        require(result == 2**200, "Phantom overflow mulDiv failed");
    }

    function testMulDivRoundingUp() public pure {
        uint256 x = 10;
        uint256 y = 10;
        uint256 denominator = 3;

        uint256 floorRes = MathUtils.mulDiv(x, y, denominator);
        uint256 ceilRes = MathUtils.mulDivRoundingUp(x, y, denominator);

        require(floorRes == 33, "Floor failed");
        require(ceilRes == 34, "Ceil failed");
    }
}
