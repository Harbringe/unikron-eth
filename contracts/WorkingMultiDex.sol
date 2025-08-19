// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title WorkingMultiDex - Production Multi-DEX Aggregator Interface
 * @notice Interface contract that delegates to RealDexAggregator
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

    // Real DEX aggregator address
    address public realDexAggregator;
    
    // Interface for RealDexAggregator
    interface IRealDexAggregator {
        struct DexQuote {
            uint8 dexType;
            string dexName;
            address router;
            uint256 amountOut;
            uint256 gasEstimate;
            uint256 priceImpact;
            address[] path;
            bytes routeData;
            bool isActive;
            uint256 reliability;
        }
        
        function getAllQuotes(address tokenIn, address tokenOut, uint256 amountIn) 
            external view returns (DexQuote[] memory quotes);
            
        function getBestQuote(address tokenIn, address tokenOut, uint256 amountIn) 
            external view returns (DexQuote memory bestQuote);
    }
    
    // Supported DEXs for compatibility
    string[] public supportedDexs = [
        "UniswapV2",
        "SushiSwap", 
        "UniswapV3",
        "1inch",
        "Curve"
    ];
    mapping(string => bool) public dexActive;

    constructor(address _realDexAggregator) Ownable(msg.sender) {
        realDexAggregator = _realDexAggregator;
        
        // Initialize active DEXs
        dexActive["UniswapV2"] = true;
        dexActive["SushiSwap"] = true;
        dexActive["UniswapV3"] = true;
        dexActive["1inch"] = true;
        dexActive["Curve"] = true;
    }

    function getAllQuotes(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (DexQuote[] memory) {
        require(amountIn > 0, "Invalid amount");
        require(realDexAggregator != address(0), "Real DEX aggregator not set");

        IRealDexAggregator aggregator = IRealDexAggregator(realDexAggregator);
        
        try aggregator.getAllQuotes(tokenIn, tokenOut, amountIn) returns (
            IRealDexAggregator.DexQuote[] memory realQuotes
        ) {
            // Convert real quotes to legacy format
            DexQuote[] memory quotes = new DexQuote[](realQuotes.length);
            
            for (uint256 i = 0; i < realQuotes.length; i++) {
                quotes[i] = DexQuote({
                    dexName: realQuotes[i].dexName,
                    router: realQuotes[i].router,
                    amountOut: realQuotes[i].amountOut,
                    gasEstimate: realQuotes[i].gasEstimate,
                    slippage: realQuotes[i].priceImpact, // Use price impact as slippage
                    isActive: realQuotes[i].isActive,
                    priority: realQuotes[i].reliability / 100 // Convert reliability to priority
                });
            }
            
            return quotes;
        } catch {
            // Fallback to empty quotes if aggregator fails
            return new DexQuote[](0);
        }
    }

    function getBestQuote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (DexQuote memory) {
        require(amountIn > 0, "Invalid amount");
        require(realDexAggregator != address(0), "Real DEX aggregator not set");

        IRealDexAggregator aggregator = IRealDexAggregator(realDexAggregator);
        
        try aggregator.getBestQuote(tokenIn, tokenOut, amountIn) returns (
            IRealDexAggregator.DexQuote memory realBestQuote
        ) {
            // Convert real quote to legacy format
            return DexQuote({
                dexName: realBestQuote.dexName,
                router: realBestQuote.router,
                amountOut: realBestQuote.amountOut,
                gasEstimate: realBestQuote.gasEstimate,
                slippage: realBestQuote.priceImpact,
                isActive: realBestQuote.isActive,
                priority: realBestQuote.reliability / 100
            });
        } catch {
            // Fallback quote if aggregator fails
            return DexQuote({
                dexName: "Fallback",
                router: address(0),
                amountOut: (amountIn * 95) / 100, // 5% slippage simulation
                gasEstimate: 150000,
                slippage: 500, // 5% slippage
                isActive: false,
                priority: 1
            });
        }
    }

    // Admin function to update real DEX aggregator
    function setRealDexAggregator(address _realDexAggregator) external onlyOwner {
        require(_realDexAggregator != address(0), "Invalid address");
        realDexAggregator = _realDexAggregator;
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
