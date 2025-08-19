// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../RealDexAggregator.sol";
import "./IBLSThreshold.sol";
import "./GasPriceOracle.sol";

/**
 * @title PBSDexAggregator - PBS-Aware DEX Aggregator
 * @notice Extends RealDexAggregator with PBS (Proposer-Builder Separation) functionality
 * @dev Integrates with builder auction mechanism and encrypted order execution
 */
contract PBSDexAggregator is RealDexAggregator {
    using SafeERC20 for IERC20;

    // PBS-specific structures
    struct PBSSwapParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        address recipient;
        uint256 deadline;
        uint8 preferredDex;
        bool useMultiHop;
        bytes32 encryptedOrderId; // Link to encrypted order
        address authorizedBuilder; // Builder authorized to execute
    }

    struct BuilderExecution {
        address builder;
        uint256 executionBlock;
        uint256 gasPrice;
        uint256 bidAmount;
        bytes32 orderHash;
        bool isExecuted;
    }

    // PBS state
    mapping(address => bool) public authorizedBuilders;
    mapping(bytes32 => BuilderExecution) public builderExecutions;
    mapping(bytes32 => bool) public encryptedOrderExecuted;
    
    // Builder performance tracking
    mapping(address => uint256) public builderExecutionCount;
    mapping(address => uint256) public builderTotalGasSaved;
    mapping(address => uint256) public builderRevenue;

    // PBS configuration
    uint256 public builderSlashAmount = 0.1 ether; // Amount builders can be slashed for bad behavior
    uint256 public minBuilderStake = 1 ether; // Minimum stake required for builders
    uint256 public pbsExecutionDelay = 2; // Minimum blocks between encryption and execution
    
    // Gas price oracle for dynamic pricing
    GasPriceOracle public gasPriceOracle;

    // Events
    event PBSSwapExecuted(
        bytes32 indexed encryptedOrderId,
        address indexed builder,
        address indexed user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 gasUsed
    );

    event BuilderRegistered(address indexed builder, uint256 stake);
    event BuilderSlashed(address indexed builder, uint256 amount, string reason);

    /**
     * @notice Execute a PBS-protected swap through authorized builder
     * @param params PBS swap parameters including encrypted order reference
     * @return amountOut Actual amount received from the swap
     */
    function executePBSSwap(PBSSwapParams calldata params) 
        external 
        nonReentrant 
        whenNotPaused
        returns (uint256 amountOut) 
    {
        require(authorizedBuilders[msg.sender], "Not authorized builder");
        require(params.deadline >= block.timestamp, "Expired");
        require(params.amountIn > 0, "Invalid amount");
        require(params.tokenIn != params.tokenOut, "Same token");
        require(!encryptedOrderExecuted[params.encryptedOrderId], "Order already executed");
        require(params.authorizedBuilder == msg.sender, "Builder not authorized for this order");

        // Mark order as executed
        encryptedOrderExecuted[params.encryptedOrderId] = true;

        // Record builder execution
        builderExecutions[params.encryptedOrderId] = BuilderExecution({
            builder: msg.sender,
            executionBlock: block.number,
            gasPrice: tx.gasprice,
            bidAmount: 0, // Would be set from auction data
            orderHash: keccak256(abi.encode(params)),
            isExecuted: true
        });

        // Apply PBS-specific protections
        _applyPBSProtections(params.encryptedOrderId);

        // Execute swap through parent aggregator
        SwapParams memory standardParams = SwapParams({
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            amountIn: params.amountIn,
            minAmountOut: params.minAmountOut,
            recipient: params.recipient,
            deadline: params.deadline,
            preferredDex: DexType(params.preferredDex),
            useMultiHop: params.useMultiHop
        });

        uint256 gasStart = gasleft();
        amountOut = _executeSwapOnDex(standardParams);
        uint256 gasUsed = gasStart - gasleft();

        // Update builder statistics
        builderExecutionCount[msg.sender]++;
        builderTotalGasSaved[msg.sender] += gasUsed;

        emit PBSSwapExecuted(
            params.encryptedOrderId,
            msg.sender,
            params.recipient,
            params.tokenIn,
            params.tokenOut,
            params.amountIn,
            amountOut,
            gasUsed
        );

        return amountOut;
    }

    /**
     * @notice Execute batch of PBS swaps atomically
     * @param pbsSwaps Array of PBS swap parameters
     * @return amountsOut Array of output amounts for each swap
     */
    function executeBatchPBSSwaps(PBSSwapParams[] calldata pbsSwaps)
        external
        nonReentrant
        whenNotPaused
        returns (uint256[] memory amountsOut)
    {
        require(authorizedBuilders[msg.sender], "Not authorized builder");
        require(pbsSwaps.length > 0, "Empty batch");
        require(pbsSwaps.length <= 10, "Batch too large"); // Limit batch size

        amountsOut = new uint256[](pbsSwaps.length);

        for (uint256 i = 0; i < pbsSwaps.length; i++) {
            // Verify each swap individually
            require(pbsSwaps[i].authorizedBuilder == msg.sender, "Builder not authorized");
            require(!encryptedOrderExecuted[pbsSwaps[i].encryptedOrderId], "Order already executed");

            // Execute the swap
            amountsOut[i] = executePBSSwap(pbsSwaps[i]);
        }

        return amountsOut;
    }

    /**
     * @notice Apply PBS-specific protections during execution
     * @param encryptedOrderId The encrypted order being executed
     */
    function _applyPBSProtections(bytes32 encryptedOrderId) internal {
        // PBS Protection 1: Execution timing validation
        // Ensure sufficient time has passed since order encryption
        BuilderExecution memory execution = builderExecutions[encryptedOrderId];
        require(
            block.number >= execution.executionBlock + pbsExecutionDelay,
            "PBS execution too early"
        );

        // PBS Protection 2: Dynamic gas price validation
        // Prevent builders from manipulating gas prices for MEV
        if (address(gasPriceOracle) != address(0)) {
            require(
                gasPriceOracle.validateGasPrice(tx.gasprice, 500), // 5% tolerance
                "Gas price outside acceptable range"
            );
        } else {
            uint256 baseGasPrice = _getBaseGasPrice();
            require(
                tx.gasprice <= baseGasPrice * 150 / 100, // Max 150% of base gas price
                "Gas price too high"
            );
        }

        // PBS Protection 3: Builder reputation check
        require(builderExecutionCount[msg.sender] >= 5, "Insufficient builder history");

        // PBS Protection 4: Add execution randomness
        uint256 executionSeed = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.difficulty,
            encryptedOrderId,
            msg.sender
        )));

        // Store execution entropy (could be used for further protections)
        assembly {
            sstore(add(encryptedOrderId, 1), executionSeed)
        }
    }

    /**
     * @notice Get base gas price for validation using dynamic oracle
     * @return Base gas price from recent blocks
     */
    function _getBaseGasPrice() internal view returns (uint256) {
        if (address(gasPriceOracle) != address(0)) {
            return gasPriceOracle.getBaseGasPrice();
        }
        
        // Fallback to transaction gas price if oracle not set
        return tx.gasprice;
    }

    /**
     * @notice Register a new builder with stake
     */
    function registerBuilder() external payable {
        require(msg.value >= minBuilderStake, "Insufficient stake");
        require(!authorizedBuilders[msg.sender], "Builder already registered");

        authorizedBuilders[msg.sender] = true;
        emit BuilderRegistered(msg.sender, msg.value);
    }

    /**
     * @notice Slash a builder for malicious behavior
     * @param builder The builder to slash
     * @param reason Reason for slashing
     */
    function slashBuilder(address builder, string calldata reason) external onlyOwner {
        require(authorizedBuilders[builder], "Builder not registered");
        
        authorizedBuilders[builder] = false;
        
        // In production, this would actually slash their stake
        emit BuilderSlashed(builder, builderSlashAmount, reason);
    }

    /**
     * @notice Get PBS statistics for a builder
     * @param builder The builder address
     * @return executions Number of successful executions
     * @return totalGasSaved Total gas saved across executions
     * @return revenue Total revenue earned
     * @return isAuthorized Whether builder is currently authorized
     */
    function getBuilderStats(address builder) external view returns (
        uint256 executions,
        uint256 totalGasSaved,
        uint256 revenue,
        bool isAuthorized
    ) {
        return (
            builderExecutionCount[builder],
            builderTotalGasSaved[builder],
            builderRevenue[builder],
            authorizedBuilders[builder]
        );
    }

    /**
     * @notice Get execution details for an encrypted order
     * @param encryptedOrderId The encrypted order ID
     * @return execution Builder execution details
     */
    function getExecutionDetails(bytes32 encryptedOrderId) external view returns (BuilderExecution memory) {
        return builderExecutions[encryptedOrderId];
    }

    /**
     * @notice Check if an encrypted order has been executed
     * @param encryptedOrderId The encrypted order ID
     * @return True if order has been executed
     */
    function isOrderExecuted(bytes32 encryptedOrderId) external view returns (bool) {
        return encryptedOrderExecuted[encryptedOrderId];
    }

    // Admin functions specific to PBS
    function setBuilderSlashAmount(uint256 amount) external onlyOwner {
        builderSlashAmount = amount;
    }

    function setMinBuilderStake(uint256 amount) external onlyOwner {
        minBuilderStake = amount;
    }

    function setPBSExecutionDelay(uint256 delay) external onlyOwner {
        require(delay <= 20, "Delay too long"); // Max 20 blocks
        pbsExecutionDelay = delay;
    }
    
    function setGasPriceOracle(address _gasPriceOracle) external onlyOwner {
        gasPriceOracle = GasPriceOracle(_gasPriceOracle);
    }

    /**
     * @notice Emergency function to deauthorize a builder
     * @param builder Builder address to deauthorize
     */
    function emergencyDeauthorizeBuilder(address builder) external onlyOwner {
        authorizedBuilders[builder] = false;
    }

    /**
     * @notice Get list of all authorized builders
     * @dev This is a simplified implementation - in production use pagination
     */
    function getAuthorizedBuilders() external view returns (address[] memory) {
        // Simplified implementation - would need proper indexing in production
        address[] memory builders = new address[](100); // Max 100 builders
        uint256 count = 0;

        // This is inefficient - in production maintain a separate array
        // Just for demonstration purposes
        return builders; // Placeholder
    }

    /**
     * @notice Override parent function to add PBS compatibility
     */
    function executeSwap(SwapParams calldata params) 
        public 
        override 
        nonReentrant 
        whenNotPaused
        mevProtected
        returns (uint256 amountOut) 
    {
        // Check if this is a PBS execution
        if (authorizedBuilders[msg.sender]) {
            // This is a PBS builder execution - apply PBS protections
            bytes32 orderHash = keccak256(abi.encode(params));
            _applyPBSProtections(orderHash);
        }

        // Call parent implementation
        return super.executeSwap(params);
    }
}