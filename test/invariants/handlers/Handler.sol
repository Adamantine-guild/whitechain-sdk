// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../../contracts/AMM.sol";
import "../../../contracts/Vault.sol";

/**
 * @title Handler
 * @notice Stateful fuzzer Handler restricting input spaces to realistic bounds and intercepting reverts cleanly.
 */
contract Handler is Test {
    AMM public immutable amm;
    Vault public immutable vault;

    address[] public actors;
    address public currentActor;

    // Ghost accounting metrics
    uint256 public ghost_kLast;
    uint256 public ghost_zeroSwapsAttempted;
    uint256 public ghost_zeroSwapsReverted;
    uint256 public ghost_successfulSwaps;
    uint256 public ghost_liquidityAdditions;
    uint256 public ghost_vaultDeposits;

    mapping(address => uint256) public userAMMBalance;
    mapping(address => uint256) public userVaultBalance;

    modifier useActor(uint256 actorIndexSeed) {
        currentActor = actors[bound(actorIndexSeed, 0, actors.length - 1)];
        vm.startPrank(currentActor);
        _;
        vm.stopPrank();
    }

    constructor(AMM _amm, Vault _vault) {
        amm = _amm;
        vault = _vault;

        actors.push(address(0x1111));
        actors.push(address(0x2222));
        actors.push(address(0x3333));
        actors.push(address(0x4444));
    }

    /**
     * @notice Stateful fuzz action for adding AMM liquidity within realistic bounds.
     */
    function addLiquidity(uint256 amountXSeed, uint256 amountYSeed, uint256 actorSeed)
        external
        useActor(actorSeed)
    {
        uint256 amountX = bound(amountXSeed, 1e15, 10_000_000e18);
        uint256 amountY = bound(amountYSeed, 1e15, 10_000_000e18);

        try amm.addLiquidity(amountX, amountY, currentActor) returns (uint256 shares) {
            userAMMBalance[currentActor] += shares;
            ghost_liquidityAdditions++;
            ghost_kLast = amm.getK();
        } catch {
            // Gracefully ignore invalid initial ratio reverts during fuzzing
        }
    }

    /**
     * @notice Stateful fuzz action for removing AMM liquidity.
     */
    function removeLiquidity(uint256 sharesSeed, uint256 actorSeed)
        external
        useActor(actorSeed)
    {
        uint256 userShares = userAMMBalance[currentActor];
        if (userShares == 0) return;

        uint256 shares = bound(sharesSeed, 1, userShares);

        try amm.removeLiquidity(shares, currentActor) returns (uint256, uint256) {
            userAMMBalance[currentActor] -= shares;
            ghost_kLast = amm.getK();
        } catch {
            // Revert handled safely
        }
    }

    /**
     * @notice Stateful fuzz action for swapping Token X for Token Y.
     */
    function swapXforY(uint256 amountXInSeed, uint256 actorSeed)
        external
        useActor(actorSeed)
    {
        uint256 resX = amm.reserveX();
        uint256 resY = amm.reserveY();
        if (resX == 0 || resY == 0) return;

        // Fuzz test edge case: amount 0 swap attempt
        if (amountXInSeed % 20 == 0) {
            ghost_zeroSwapsAttempted++;
            try amm.swapXforY(0, 0) {
                // Should not reach here
            } catch {
                ghost_zeroSwapsReverted++;
                return;
            }
        }

        uint256 amountXIn = bound(amountXInSeed, 1, resX / 3);

        try amm.swapXforY(amountXIn, 0) returns (uint256) {
            ghost_successfulSwaps++;
            ghost_kLast = amm.getK();
        } catch {
            // Revert handled cleanly
        }
    }

    /**
     * @notice Stateful fuzz action for swapping Token Y for Token X.
     */
    function swapYforX(uint256 amountYInSeed, uint256 actorSeed)
        external
        useActor(actorSeed)
    {
        uint256 resX = amm.reserveX();
        uint256 resY = amm.reserveY();
        if (resX == 0 || resY == 0) return;

        uint256 amountYIn = bound(amountYInSeed, 1, resY / 3);

        try amm.swapYforX(amountYIn, 0) returns (uint256) {
            ghost_successfulSwaps++;
            ghost_kLast = amm.getK();
        } catch {
            // Revert handled cleanly
        }
    }

    /**
     * @notice Stateful fuzz action for Vault deposits.
     */
    function depositVault(uint256 assetsSeed, uint256 actorSeed)
        external
        useActor(actorSeed)
    {
        uint256 assets = bound(assetsSeed, 1e15, 1_000_000e18);

        try vault.deposit(assets, currentActor) returns (uint256 shares) {
            userVaultBalance[currentActor] += shares;
            ghost_vaultDeposits++;
        } catch {
            // Catch zero assets or arithmetic reverts
        }
    }

    /**
     * @notice Stateful fuzz action for Vault withdrawals.
     */
    function withdrawVault(uint256 sharesSeed, uint256 actorSeed)
        external
        useActor(actorSeed)
    {
        uint256 userShares = userVaultBalance[currentActor];
        if (userShares == 0) return;

        uint256 shares = bound(sharesSeed, 1, userShares);

        try vault.withdraw(shares, currentActor, currentActor) returns (uint256) {
            userVaultBalance[currentActor] -= shares;
        } catch {
            // Catch insufficient balance reverts
        }
    }

    function getActorCount() external view returns (uint256) {
        return actors.length;
    }
}
