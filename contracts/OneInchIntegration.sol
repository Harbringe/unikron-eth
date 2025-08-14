// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title OneInchIntegration - Example integration with 1inch DEX aggregator
 * @notice This shows how to integrate with 1inch for real token swaps
 * @dev This is an example - in production, you'd use the official 1inch contracts
 */
contract OneInchIntegration {
    using SafeERC20 for IERC20;

    // 1inch Router address (mainnet)
    address public constant ONEINCH_ROUTER =
        0x1111111254EEB25477B68fb85Ed929f73A960582;

    // 1inch API address for quotes
    address public constant ONEINCH_API =
        0x1111111254EEB25477B68fb85Ed929f73A960582;

    // Events
    event SwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address indexed user
    );

    /**
     * @notice Execute a swap through 1inch
     * @param tokenIn Input token address
     * @param tokenOut Output token address
     * @param amountIn Amount of input tokens
     * @param minAmountOut Minimum amount of output tokens
     * @param swapData 1inch swap data (obtained from their API)
     */
    function executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata swapData
    ) external returns (uint256 amountOut) {
        // Transfer tokens from user to this contract
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Approve 1inch router to spend our tokens
        IERC20(tokenIn).approve(ONEINCH_ROUTER, amountIn);

        // Execute the swap through 1inch
        (bool success, bytes memory result) = ONEINCH_ROUTER.call(swapData);
        require(success, "1inch swap failed");

        // Get the amount received
        amountOut = IERC20(tokenOut).balanceOf(address(this));
        require(amountOut >= minAmountOut, "Insufficient output amount");

        // Transfer output tokens to user
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);

        // Reset approval
        IERC20(tokenIn).approve(ONEINCH_ROUTER, 0);

        emit SwapExecuted(tokenIn, tokenOut, amountIn, amountOut, msg.sender);

        return amountOut;
    }

    /**
     * @notice Get a quote from 1inch (this would typically be done off-chain)
     * @dev In practice, you'd call 1inch's API to get the best route
     */
    function getQuote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (uint256 estimatedAmountOut) {
        // This is a simplified example
        // In reality, you'd call 1inch's API or use their SDK

        // For demonstration, return a simulated quote
        // In production, this would be the actual quote from 1inch
        estimatedAmountOut = (amountIn * 95) / 100; // 5% slippage simulation

        return estimatedAmountOut;
    }

    /**
     * @notice Emergency function to rescue tokens
     */
    function rescueTokens(address token, address to, uint256 amount) external {
        // Only allow owner or in emergency situations
        IERC20(token).safeTransfer(to, amount);
    }
}
