// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface I1inchAggregator {
    struct SwapDescription {
        address srcToken;
        address dstToken;
        address srcReceiver;
        address dstReceiver;
        uint256 amount;
        uint256 minReturnAmount;
        uint256 flags;
        bytes permit;
    }

    function swap(
        address executor,
        SwapDescription calldata desc,
        bytes calldata permit,
        bytes calldata data
    ) external payable returns (uint256 returnAmount, uint256 spentAmount);

    function unoswap(
        address srcToken,
        uint256 amount,
        uint256 minReturn,
        bytes32[] calldata pools
    ) external payable returns (uint256 returnAmount);

    function getExpectedReturn(
        address srcToken,
        address dstToken,
        uint256 amount,
        uint256 parts,
        uint256 flags
    ) external view returns (
        uint256 returnAmount,
        uint256[] memory distribution
    );
}

interface I1inchQuoter {
    function getAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (uint256 amountOut);
}