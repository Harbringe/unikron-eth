// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title WorkingMultiDex - Simple Working Multi-DEX Aggregator
 */
contract WorkingMultiDex is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    struct DexQuote {
        string dexName;
        address router;
        uint256 amountOut;
        uint256 gasEstimate;
        uint256 slippage;
        bool isActive;
        uint256 priority;
    }

    // Simple DEX configuration
    string[] public supportedDexs = [
        "UniswapV2",
        "SushiSwap",
        "UniswapV3",
        "Curve",
        "Balancer"
    ];
    mapping(string => address) public dexRouters;
    mapping(string => bool) public dexActive;
    mapping(string => uint256) public dexPriority;

    constructor() Ownable(msg.sender) {
        // Initialize DEXs
        dexRouters["UniswapV2"] = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
        dexRouters["SushiSwap"] = 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F;
        dexRouters["UniswapV3"] = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
        dexRouters["Curve"] = 0x99a58482BD75cbab83b27EC03CA68fF489b5788f;
        dexRouters["Balancer"] = 0xE592427A0AEce92De3Edee1F18E0157C05861564;

        dexActive["UniswapV2"] = true;
        dexActive["SushiSwap"] = true;
        dexActive["UniswapV3"] = true;
        dexActive["Curve"] = true;
        dexActive["Balancer"] = true;

        dexPriority["UniswapV2"] = 1;
        dexPriority["SushiSwap"] = 2;
        dexPriority["UniswapV3"] = 3;
        dexPriority["Curve"] = 4;
        dexPriority["Balancer"] = 5;
    }

    function getAllQuotes(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (DexQuote[] memory) {
        require(amountIn > 0, "Invalid amount");

        DexQuote[] memory quotes = new DexQuote[](supportedDexs.length);

        for (uint i = 0; i < supportedDexs.length; i++) {
            string memory dexName = supportedDexs[i];

            if (dexActive[dexName]) {
                (
                    uint256 amountOut,
                    uint256 gasEstimate,
                    uint256 slippage
                ) = _simulateQuote(dexName, amountIn);

                quotes[i] = DexQuote({
                    dexName: dexName,
                    router: dexRouters[dexName],
                    amountOut: amountOut,
                    gasEstimate: gasEstimate,
                    slippage: slippage,
                    isActive: true,
                    priority: dexPriority[dexName]
                });
            }
        }

        return quotes;
    }

    function getBestQuote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (DexQuote memory) {
        require(amountIn > 0, "Invalid amount");

        // Find best quote directly without calling getAllQuotes
        DexQuote memory bestQuote;
        bool found = false;

        for (uint i = 0; i < supportedDexs.length; i++) {
            string memory dexName = supportedDexs[i];

            if (dexActive[dexName]) {
                (
                    uint256 amountOut,
                    uint256 gasEstimate,
                    uint256 slippage
                ) = _simulateQuote(dexName, amountIn);

                DexQuote memory currentQuote = DexQuote({
                    dexName: dexName,
                    router: dexRouters[dexName],
                    amountOut: amountOut,
                    gasEstimate: gasEstimate,
                    slippage: slippage,
                    isActive: true,
                    priority: dexPriority[dexName]
                });

                if (!found || currentQuote.amountOut > bestQuote.amountOut) {
                    bestQuote = currentQuote;
                    found = true;
                }
            }
        }

        require(found, "No active DEXs");
        return bestQuote;
    }

    function _simulateQuote(
        string memory dexName,
        uint256 amountIn
    )
        internal
        pure
        returns (uint256 amountOut, uint256 gasEstimate, uint256 slippage)
    {
        if (keccak256(bytes(dexName)) == keccak256(bytes("UniswapV2"))) {
            amountOut = (amountIn * 96) / 100;
            gasEstimate = 150000;
            slippage = 400;
        } else if (keccak256(bytes(dexName)) == keccak256(bytes("SushiSwap"))) {
            amountOut = (amountIn * 95) / 100;
            gasEstimate = 160000;
            slippage = 500;
        } else if (keccak256(bytes(dexName)) == keccak256(bytes("UniswapV3"))) {
            amountOut = (amountIn * 97) / 100;
            gasEstimate = 200000;
            slippage = 300;
        } else if (keccak256(bytes(dexName)) == keccak256(bytes("Curve"))) {
            amountOut = (amountIn * 98) / 100;
            gasEstimate = 180000;
            slippage = 200;
        } else if (keccak256(bytes(dexName)) == keccak256(bytes("Balancer"))) {
            amountOut = (amountIn * 96) / 100;
            gasEstimate = 220000;
            slippage = 400;
        } else {
            amountOut = (amountIn * 95) / 100;
            gasEstimate = 200000;
            slippage = 500;
        }
    }

    function getSupportedDexs() external view returns (string[] memory) {
        return supportedDexs;
    }

    function isDexActive(string memory name) external view returns (bool) {
        return dexActive[name];
    }

    // Admin functions
    function setDexActive(string memory name, bool active) external onlyOwner {
        dexActive[name] = active;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    receive() external payable {}
}
