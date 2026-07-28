// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";
import "../../contracts/AMM.sol";
import "../../contracts/Vault.sol";
import "./handlers/Handler.sol";

/**
 * @title AMMInvariantTest
 * @notice Invariant test suite validating critical economic properties of WhiteChain AMM and Vault smart contracts.
 */
contract AMMInvariantTest is StdInvariant, Test {
    AMM public amm;
    Vault public vault;
    Handler public handler;

    uint256 public constant INITIAL_X = 100_000e18;
    uint256 public constant INITIAL_Y = 100_000e18;

    function setUp() public {
        amm = new AMM();
        vault = new Vault("WhiteChain Vault", "WVAULT");

        // Seed initial pool liquidity
        amm.addLiquidity(INITIAL_X, INITIAL_Y, address(this));

        // Instantiate stateful Handler fuzzer
        handler = new Handler(amm, vault);

        // Register handler as sole target for invariant fuzzing
        targetContract(address(handler));
    }

    /**
     * @notice Invariant 1: Constant Product Formula (x * y >= k) must hold true across all trade sequences.
     * Swaps with 0.3% fees must never decrease the pool constant k.
     */
    function invariant_constantProductFormulaHold() public view {
        uint256 currentK = amm.getK();
        uint256 kLast = amm.kLast();

        assertGe(currentK, kLast, "INVARIANT VIOLATION: Constant product formula x * y >= k was broken!");
    }

    /**
     * @notice Invariant 2: Total Vault shares must never exceed total Vault underlying assets.
     */
    function invariant_totalSharesLessOrEqualTotalAssets() public view {
        uint256 totalSupply = vault.totalSupply();
        uint256 totalAssets = vault.totalAssets();

        if (totalSupply > 0) {
            assertLe(totalSupply, totalAssets, "INVARIANT VIOLATION: Vault totalShares > totalAssets!");
        }
    }

    /**
     * @notice Invariant 3: Individual user LP & Vault balances must never exceed total supply.
     */
    function invariant_userBalanceLessOrEqualTotalSupply() public view {
        uint256 numActors = handler.getActorCount();

        for (uint256 i = 0; i < numActors; i++) {
            address actor = handler.actors(i);
            assertLe(
                amm.balanceOf(actor),
                amm.totalSupply(),
                "INVARIANT VIOLATION: Individual AMM user balance > totalSupply!"
            );
            assertLe(
                vault.balanceOf(actor),
                vault.totalSupply(),
                "INVARIANT VIOLATION: Individual Vault user balance > totalSupply!"
            );
        }
    }

    /**
     * @notice Invariant 4: Zero-amount swap attempts must revert gracefully without breaking state or crashing fuzz runs.
     */
    function invariant_zeroAmountSwapRevertsGracefully() public view {
        uint256 attempted = handler.ghost_zeroSwapsAttempted();
        uint256 reverted = handler.ghost_zeroSwapsReverted();

        assertEq(attempted, reverted, "INVARIANT VIOLATION: Zero-amount swap failed to revert gracefully!");
    }
}
