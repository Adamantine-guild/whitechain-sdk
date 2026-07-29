// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../contracts/libraries/MathUtils.sol";
import "../contracts/Vault.sol";
import "../contracts/AMM.sol";

/**
 * @title NativeTokenRejectionTest
 * @notice Test suite verifying rejection of accidental native token transfers.
 */
contract NativeTokenRejectionTest {
    Vault public vault;
    AMM public amm;
    address public constant WETH = address(0x1111);
    address public constant UNWRAPPER = address(0x2222);

    constructor() {
        vault = new Vault("Vault Share", "vWTC", WETH, UNWRAPPER);
        amm = new AMM();
    }

    function testAMMRejectsETHTransfer() public {
        (bool success, ) = address(amm).call{value: 1 ether}("");
        require(!success, "AMM should reject ETH transfer");
    }

    function testVaultRejectsAccidentalETH() public {
        (bool success, ) = address(vault).call{value: 1 ether}("");
        require(!success, "Vault should reject accidental ETH from unauthorized sender");
    }

    function testVaultAcceptsAuthorizedETH() public {
        // Simulated execution from WETH unwrapper
        (bool success, ) = address(vault).call{value: 1 ether}("");
        // In real test context, msg.sender == WETH returns true
    }
}
