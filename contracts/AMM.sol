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
 * @notice Constant-product Automated Market Maker (x * y = k) for token pair trading and liquidity management.
 */
contract AMM {
    string public name = "WhiteChain AMM Pool";
    string public symbol = "WAM-LP";
    uint8 public constant decimals = 18;

    uint256 public reserveX;
    uint256 public reserveY;
    uint256 public kLast;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    event LiquidityAdded(address indexed provider, uint256 amountX, uint256 amountY, uint256 shares);
    event LiquidityRemoved(address indexed provider, uint256 amountX, uint256 amountY, uint256 shares);
    event Swap(address indexed trader, address indexed tokenIn, uint256 amountIn, uint256 amountOut);

    /**
     * @notice Adds liquidity to the AMM pool and mints LP shares proportional to pool ownership.
     */
    function addLiquidity(uint256 amountX, uint256 amountY, address receiver) external returns (uint256 shares) {
        require(amountX > 0 && amountY > 0, "AMM: zero liquidity amounts");

        if (totalSupply == 0) {
            shares = MathSqrt.sqrt(amountX * amountY);
            require(shares > 0, "AMM: insufficient initial liquidity");
        } else {
            uint256 shareX = (amountX * totalSupply) / reserveX;
            uint256 shareY = (amountY * totalSupply) / reserveY;
            shares = shareX < shareY ? shareX : shareY;
            require(shares > 0, "AMM: insufficient liquidity minted");
        }

        reserveX += amountX;
        reserveY += amountY;
        kLast = reserveX * reserveY;

        totalSupply += shares;
        balanceOf[receiver] += shares;

        emit LiquidityAdded(msg.sender, amountX, amountY, shares);
    }

    /**
     * @notice Removes liquidity from the AMM pool by burning LP shares.
     */
    function removeLiquidity(uint256 shares, address receiver) external returns (uint256 amountX, uint256 amountY) {
        require(shares > 0, "AMM: zero shares");
        require(balanceOf[msg.sender] >= shares, "AMM: insufficient LP balance");

        amountX = (shares * reserveX) / totalSupply;
        amountY = (shares * reserveY) / totalSupply;
        require(amountX > 0 && amountY > 0, "AMM: zero output amounts");

        balanceOf[msg.sender] -= shares;
        totalSupply -= shares;

        reserveX -= amountX;
        reserveY -= amountY;
        kLast = reserveX * reserveY;

        emit LiquidityRemoved(msg.sender, amountX, amountY, shares);
    }

    /**
     * @notice Swaps token X for token Y with a 0.3% fee.
     */
    function swapXforY(uint256 amountXIn, uint256 minAmountYOut) external returns (uint256 amountYOut) {
        require(amountXIn > 0, "AMM: zero swap input");
        require(reserveX > 0 && reserveY > 0, "AMM: empty pool reserves");

        uint256 amountXInWithFee = amountXIn * 997;
        uint256 numerator = amountXInWithFee * reserveY;
        uint256 denominator = (reserveX * 1000) + amountXInWithFee;
        amountYOut = numerator / denominator;

        require(amountYOut >= minAmountYOut, "AMM: slippage limit exceeded");
        require(amountYOut < reserveY, "AMM: insufficient pool liquidity");

        reserveX += amountXIn;
        reserveY -= amountYOut;
        kLast = reserveX * reserveY;

        emit Swap(msg.sender, address(0), amountXIn, amountYOut);
    }

    /**
     * @notice Swaps token Y for token X with a 0.3% fee.
     */
    function swapYforX(uint256 amountYIn, uint256 minAmountXOut) external returns (uint256 amountXOut) {
        require(amountYIn > 0, "AMM: zero swap input");
        require(reserveX > 0 && reserveY > 0, "AMM: empty pool reserves");

        uint256 amountYInWithFee = amountYIn * 997;
        uint256 numerator = amountYInWithFee * reserveX;
        uint256 denominator = (reserveY * 1000) + amountYInWithFee;
        amountXOut = numerator / denominator;

        require(amountXOut >= minAmountXOut, "AMM: slippage limit exceeded");
        require(amountXOut < reserveX, "AMM: insufficient pool liquidity");

        reserveY += amountYIn;
        reserveX -= amountXOut;
        kLast = reserveX * reserveY;

        emit Swap(msg.sender, address(1), amountYIn, amountXOut);
    }

    /**
     * @notice Returns the current pool constant product value (k = x * y).
     */
    function getK() external view returns (uint256) {
        return reserveX * reserveY;
    }
}

library MathSqrt {
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
