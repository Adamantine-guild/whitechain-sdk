// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./libraries/MathUtils.sol";

/**
 * @title Vault
 * @notice Yield compounding Vault utilizing Yul-optimized MathUtils.mulDiv for high-precision, low-gas fixed-point math.
 */
contract Vault {
    using MathUtils for uint256;

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 public totalAssets;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;

    event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares);
    event Rebalanced(uint256 previousAssets, uint256 newAssets, uint256 yieldCompounded);

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    /**
     * @notice Converts an asset amount to shares using MathUtils.mulDiv.
     */
    function convertToShares(uint256 assets) public view returns (uint256 shares) {
        if (totalSupply == 0 || totalAssets == 0) {
            return assets;
        }
        return MathUtils.mulDiv(assets, totalSupply, totalAssets);
    }

    /**
     * @notice Converts a share amount to asset value using MathUtils.mulDiv.
     */
    function convertToAssets(uint256 shares) public view returns (uint256 assets) {
        if (totalSupply == 0) {
            return shares;
        }
        return MathUtils.mulDiv(shares, totalAssets, totalSupply);
    }

    /**
     * @notice Deposit assets into the vault to mint shares.
     */
    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        require(assets > 0, "Vault: zero assets");
        shares = convertToShares(assets);

        totalAssets += assets;
        totalSupply += shares;
        balanceOf[receiver] += shares;

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /**
     * @notice Withdraw shares from the vault to redeem assets.
     */
    function withdraw(uint256 shares, address receiver, address owner) external returns (uint256 assets) {
        require(shares > 0, "Vault: zero shares");
        require(balanceOf[owner] >= shares, "Vault: insufficient balance");

        assets = convertToAssets(shares);

        balanceOf[owner] -= shares;
        totalSupply -= shares;
        totalAssets -= assets;

        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    /**
     * @notice Rebalances strategy and compounds yield with Yul-optimized 18-decimal fixed-point calculations.
     */
    function rebalance(uint256 yieldRateBps, uint256 multiplierBps) external returns (uint256 newTotalAssets) {
        uint256 compoundedYield = MathUtils.mulDiv(totalAssets, yieldRateBps, 10000);
        uint256 adjustedAssets = MathUtils.mulDiv(totalAssets + compoundedYield, multiplierBps, 10000);

        uint256 prevAssets = totalAssets;
        totalAssets = adjustedAssets;

        emit Rebalanced(prevAssets, adjustedAssets, compoundedYield);
        return adjustedAssets;
    }
}
