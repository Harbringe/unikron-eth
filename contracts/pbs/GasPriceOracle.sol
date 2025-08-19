// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title GasPriceOracle - Dynamic Gas Price Oracle
 * @notice Tracks and provides dynamic gas price information for MEV protection
 * @dev Maintains rolling window of recent gas prices for accurate market rates
 */
contract GasPriceOracle is Ownable, ReentrancyGuard {
    
    // Gas price data structure
    struct GasPriceData {
        uint256 gasPrice;
        uint256 blockNumber;
        uint256 timestamp;
        uint256 baseFeePerGas;
        uint256 priorityFeePerGas;
    }
    
    // Configuration
    uint256 public constant MAX_HISTORY_BLOCKS = 50; // Track last 50 blocks
    uint256 public constant MIN_PRICE_SAMPLES = 10; // Minimum samples for reliable data
    uint256 public constant PRICE_TOLERANCE_BPS = 300; // 3% price tolerance
    
    // State variables
    GasPriceData[] public gasPriceHistory;
    uint256 public currentIndex;
    uint256 public totalSamples;
    
    // Cached values for gas efficiency
    uint256 public lastCalculatedBlock;
    uint256 public cachedBasePrice;
    uint256 public cachedMedianPrice;
    uint256 public cachedPercentile90Price;
    
    // Price thresholds
    uint256 public minGasPrice = 1 gwei;
    uint256 public maxGasPrice = 1000 gwei;
    
    // Events
    event GasPriceUpdated(uint256 indexed blockNumber, uint256 gasPrice, uint256 baseFee);
    event PriceThresholdsUpdated(uint256 minPrice, uint256 maxPrice);
    
    constructor() Ownable(msg.sender) {
        // Initialize with current block's gas price
        _updateGasPrice();
    }
    
    /**
     * @notice Update gas price with current transaction data
     * @dev Called automatically or manually to maintain recent price data
     */
    function updateGasPrice() external nonReentrant {
        _updateGasPrice();
    }
    
    /**
     * @notice Get current base gas price for validation
     * @return basePrice Current market base gas price
     */
    function getBaseGasPrice() external view returns (uint256 basePrice) {
        // Return cached value if recent enough
        if (block.number <= lastCalculatedBlock + 2) {
            return cachedBasePrice;
        }
        
        // Recalculate if cache is stale
        return _calculateBaseGasPrice();
    }
    
    /**
     * @notice Get median gas price from recent history
     * @return medianPrice Median gas price over recent blocks
     */
    function getMedianGasPrice() external view returns (uint256 medianPrice) {
        if (block.number <= lastCalculatedBlock + 2) {
            return cachedMedianPrice;
        }
        
        return _calculateMedianGasPrice();
    }
    
    /**
     * @notice Get 90th percentile gas price (for high-priority transactions)
     * @return percentile90Price 90th percentile gas price
     */
    function getPercentile90GasPrice() external view returns (uint256 percentile90Price) {
        if (block.number <= lastCalculatedBlock + 2) {
            return cachedPercentile90Price;
        }
        
        return _calculatePercentile90GasPrice();
    }
    
    /**
     * @notice Validate if a gas price is reasonable for MEV protection
     * @param gasPrice Gas price to validate
     * @param tolerance Tolerance in basis points (100 = 1%)
     * @return isValid True if gas price is within reasonable bounds
     */
    function validateGasPrice(uint256 gasPrice, uint256 tolerance) external view returns (bool isValid) {
        if (gasPrice < minGasPrice || gasPrice > maxGasPrice) {
            return false;
        }
        
        uint256 basePrice = _calculateBaseGasPrice();
        uint256 maxAllowed = basePrice * (10000 + tolerance) / 10000;
        uint256 minAllowed = basePrice * (10000 - tolerance) / 10000;
        
        return gasPrice >= minAllowed && gasPrice <= maxAllowed;
    }
    
    /**
     * @notice Get comprehensive gas price statistics
     * @return stats Array containing [base, median, p90, min, max, samples]
     */
    function getGasPriceStats() external view returns (uint256[6] memory stats) {
        uint256 basePrice = _calculateBaseGasPrice();
        uint256 medianPrice = _calculateMedianGasPrice();
        uint256 p90Price = _calculatePercentile90GasPrice();
        
        (uint256 minPrice, uint256 maxPrice) = _getMinMaxPrices();
        
        return [basePrice, medianPrice, p90Price, minPrice, maxPrice, totalSamples];
    }
    
    /**
     * @notice Internal function to update gas price data
     */
    function _updateGasPrice() internal {
        uint256 currentGasPrice = tx.gasprice;
        uint256 baseFeePerGas = _getBaseFee();
        uint256 priorityFee = currentGasPrice > baseFeePerGas ? currentGasPrice - baseFeePerGas : 0;
        
        // Add new data point
        if (gasPriceHistory.length < MAX_HISTORY_BLOCKS) {
            gasPriceHistory.push(GasPriceData({
                gasPrice: currentGasPrice,
                blockNumber: block.number,
                timestamp: block.timestamp,
                baseFeePerGas: baseFeePerGas,
                priorityFeePerGas: priorityFee
            }));
            totalSamples++;
        } else {
            // Circular buffer - overwrite oldest entry
            gasPriceHistory[currentIndex] = GasPriceData({
                gasPrice: currentGasPrice,
                blockNumber: block.number,
                timestamp: block.timestamp,
                baseFeePerGas: baseFeePerGas,
                priorityFeePerGas: priorityFee
            });
            currentIndex = (currentIndex + 1) % MAX_HISTORY_BLOCKS;
        }
        
        // Update cached values
        _updateCachedPrices();
        
        emit GasPriceUpdated(block.number, currentGasPrice, baseFeePerGas);
    }
    
    /**
     * @notice Calculate base gas price from recent history
     */
    function _calculateBaseGasPrice() internal view returns (uint256) {
        if (totalSamples == 0) return tx.gasprice;
        
        uint256 sum = 0;
        uint256 count = 0;
        uint256 cutoffBlock = block.number >= 10 ? block.number - 10 : 0;
        
        // Calculate weighted average of recent blocks
        for (uint256 i = 0; i < gasPriceHistory.length && i < totalSamples; i++) {
            if (gasPriceHistory[i].blockNumber >= cutoffBlock) {
                // Weight more recent blocks higher
                uint256 weight = gasPriceHistory[i].blockNumber - cutoffBlock + 1;
                sum += gasPriceHistory[i].gasPrice * weight;
                count += weight;
            }
        }
        
        return count > 0 ? sum / count : tx.gasprice;
    }
    
    /**
     * @notice Calculate median gas price
     */
    function _calculateMedianGasPrice() internal view returns (uint256) {
        if (totalSamples < MIN_PRICE_SAMPLES) return _calculateBaseGasPrice();
        
        // Create array of recent prices
        uint256[] memory prices = new uint256[](totalSamples);
        uint256 count = 0;
        
        for (uint256 i = 0; i < gasPriceHistory.length && count < totalSamples; i++) {
            prices[count] = gasPriceHistory[i].gasPrice;
            count++;
        }
        
        // Simple bubble sort for median calculation
        for (uint256 i = 0; i < count - 1; i++) {
            for (uint256 j = 0; j < count - i - 1; j++) {
                if (prices[j] > prices[j + 1]) {
                    uint256 temp = prices[j];
                    prices[j] = prices[j + 1];
                    prices[j + 1] = temp;
                }
            }
        }
        
        // Return median value
        if (count % 2 == 0) {
            return (prices[count / 2 - 1] + prices[count / 2]) / 2;
        } else {
            return prices[count / 2];
        }
    }
    
    /**
     * @notice Calculate 90th percentile gas price
     */
    function _calculatePercentile90GasPrice() internal view returns (uint256) {
        if (totalSamples < MIN_PRICE_SAMPLES) {
            return _calculateBaseGasPrice() * 150 / 100; // 150% of base if insufficient data
        }
        
        // Use median calculation logic but for 90th percentile
        uint256[] memory prices = new uint256[](totalSamples);
        uint256 count = 0;
        
        for (uint256 i = 0; i < gasPriceHistory.length && count < totalSamples; i++) {
            prices[count] = gasPriceHistory[i].gasPrice;
            count++;
        }
        
        // Sort prices
        for (uint256 i = 0; i < count - 1; i++) {
            for (uint256 j = 0; j < count - i - 1; j++) {
                if (prices[j] > prices[j + 1]) {
                    uint256 temp = prices[j];
                    prices[j] = prices[j + 1];
                    prices[j + 1] = temp;
                }
            }
        }
        
        // Return 90th percentile
        uint256 index90 = (count * 90) / 100;
        return prices[index90 >= count ? count - 1 : index90];
    }
    
    /**
     * @notice Get min and max prices from history
     */
    function _getMinMaxPrices() internal view returns (uint256 minPrice, uint256 maxPrice) {
        if (totalSamples == 0) return (tx.gasprice, tx.gasprice);
        
        minPrice = type(uint256).max;
        maxPrice = 0;
        
        for (uint256 i = 0; i < gasPriceHistory.length && i < totalSamples; i++) {
            if (gasPriceHistory[i].gasPrice < minPrice) {
                minPrice = gasPriceHistory[i].gasPrice;
            }
            if (gasPriceHistory[i].gasPrice > maxPrice) {
                maxPrice = gasPriceHistory[i].gasPrice;
            }
        }
    }
    
    /**
     * @notice Update cached price values
     */
    function _updateCachedPrices() internal {
        lastCalculatedBlock = block.number;
        cachedBasePrice = _calculateBaseGasPrice();
        cachedMedianPrice = _calculateMedianGasPrice();
        cachedPercentile90Price = _calculatePercentile90GasPrice();
    }
    
    /**
     * @notice Get base fee from block (EIP-1559)
     */
    function _getBaseFee() internal view returns (uint256) {
        // For networks with EIP-1559, this would return block.basefee
        // For simplicity, use a calculated base fee
        return tx.gasprice * 70 / 100; // Assume base fee is ~70% of total gas price
    }
    
    // Admin functions
    function setPriceThresholds(uint256 _minGasPrice, uint256 _maxGasPrice) external onlyOwner {
        require(_minGasPrice < _maxGasPrice, "Invalid thresholds");
        require(_minGasPrice >= 0.1 gwei && _maxGasPrice <= 2000 gwei, "Thresholds out of range");
        
        minGasPrice = _minGasPrice;
        maxGasPrice = _maxGasPrice;
        
        emit PriceThresholdsUpdated(_minGasPrice, _maxGasPrice);
    }
    
    /**
     * @notice Manual override for emergencies
     */
    function emergencySetBasePrice(uint256 price) external onlyOwner {
        require(price >= 1 gwei && price <= 500 gwei, "Price out of emergency range");
        cachedBasePrice = price;
        lastCalculatedBlock = block.number;
    }
    
    /**
     * @notice Get recent gas price history for analysis
     */
    function getRecentHistory(uint256 blocks) external view returns (GasPriceData[] memory) {
        require(blocks <= MAX_HISTORY_BLOCKS, "Too many blocks requested");
        
        uint256 actualBlocks = blocks > totalSamples ? totalSamples : blocks;
        GasPriceData[] memory recent = new GasPriceData[](actualBlocks);
        
        uint256 startIndex = totalSamples <= currentIndex ? 0 : currentIndex;
        
        for (uint256 i = 0; i < actualBlocks; i++) {
            uint256 index = (startIndex + totalSamples - actualBlocks + i) % gasPriceHistory.length;
            recent[i] = gasPriceHistory[index];
        }
        
        return recent;
    }
}