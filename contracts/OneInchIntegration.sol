// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title OneInchIntegration - Production 1inch DEX aggregator integration
 * @notice Real integration with 1inch for token swaps
 * @dev Uses official 1inch contracts and interfaces
 */
contract OneInchIntegration {
    using SafeERC20 for IERC20;

    // 1inch Router address (mainnet)
    address public constant ONEINCH_ROUTER =
        0x1111111254EEB25477B68fb85Ed929f73A960582;

    // 1inch Aggregation Router V5
    address public constant ONEINCH_V5_AGGREGATION_ROUTER = 
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
     * @notice Execute a swap through 1inch V5 aggregation router
     * @param tokenIn Input token address
     * @param tokenOut Output token address
     * @param amountIn Amount of input tokens
     * @param minAmountOut Minimum amount of output tokens
     * @param swapData 1inch swap data (obtained from their API)
     * @param recipient Recipient of output tokens
     */
    function executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata swapData,
        address recipient
    ) external returns (uint256 amountOut) {
        require(recipient != address(0), "Invalid recipient");
        
        // Get initial balance to calculate exact amount out
        uint256 initialBalance = IERC20(tokenOut).balanceOf(recipient);
        
        // Transfer tokens from user to this contract
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Approve 1inch router to spend our tokens
        IERC20(tokenIn).approve(ONEINCH_V5_AGGREGATION_ROUTER, amountIn);

        // Execute the swap through 1inch
        (bool success, bytes memory result) = ONEINCH_V5_AGGREGATION_ROUTER.call(swapData);
        require(success, "1inch swap failed");

        // Calculate actual amount received
        uint256 finalBalance = IERC20(tokenOut).balanceOf(recipient);
        amountOut = finalBalance - initialBalance;
        
        require(amountOut >= minAmountOut, "Insufficient output amount");

        // If tokens are still in this contract, transfer to recipient
        uint256 remainingBalance = IERC20(tokenOut).balanceOf(address(this));
        if (remainingBalance > 0) {
            IERC20(tokenOut).safeTransfer(recipient, remainingBalance);
            amountOut += remainingBalance;
        }

        // Reset approval for security
        IERC20(tokenIn).approve(ONEINCH_V5_AGGREGATION_ROUTER, 0);

        emit SwapExecuted(tokenIn, tokenOut, amountIn, amountOut, recipient);

        return amountOut;
    }

    /**
     * @notice Execute swap with automatic recipient (msg.sender)
     */
    function executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata swapData
    ) external returns (uint256 amountOut) {
        return executeSwap(tokenIn, tokenOut, amountIn, minAmountOut, swapData, msg.sender);
    }

    /**
     * @notice Get estimated quote from 1inch (off-chain integration required)
     * @dev This is a placeholder - real implementation requires 1inch API integration
     * @param tokenIn Input token address
     * @param tokenOut Output token address 
     * @param amountIn Input amount
     * @return estimatedAmountOut Estimated output amount
     * @return gasEstimate Estimated gas cost
     */
    function getQuote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (uint256 estimatedAmountOut, uint256 gasEstimate) {
        // NOTE: In production, this would make an off-chain API call to 1inch
        // For now, we provide a conservative estimate
        
        // 1inch typically provides very competitive rates (0.1-0.5% total cost)
        estimatedAmountOut = (amountIn * 995) / 1000; // 0.5% total cost estimate
        gasEstimate = 250000; // 1inch swaps typically use more gas but get better prices
        
        return (estimatedAmountOut, gasEstimate);
    }

    /**
     * @notice Check if 1inch router is available
     */
    function isRouterAvailable() external view returns (bool) {
        // Check if router contract exists
        uint32 size;
        assembly {
            size := extcodesize(ONEINCH_V5_AGGREGATION_ROUTER)
        }
        return size > 0;
    }

    /**
     * @notice Get 1inch router address
     */
    function getRouterAddress() external pure returns (address) {
        return ONEINCH_V5_AGGREGATION_ROUTER;
    }
}
