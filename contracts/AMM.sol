// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AMM
 * @notice Automated Market Maker contract that explicitly rejects plain native token (ETH) transfers.
 * @dev Omitted receive() and fallback() payable functions so plain ETH transfers revert immediately.
 */
contract AMM {
    string public name = "WhiteChain AMM";

    // Plain native token transfers to this contract will revert instantly to prevent trapped funds.
}
