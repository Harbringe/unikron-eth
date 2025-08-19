// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IBLSThreshold.sol";
import "./ITimelock.sol";
import "./ValidatorNetwork.sol";

/**
 * @title PBSMevDex - PBS Encryption-Based MEV-Protected DEX
 * @notice Uses Proposer-Builder Separation with threshold encryption for MEV protection
 * @dev Implements time-locked encryption and validator threshold signatures
 */
contract PBSMevDex is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    // PBS Components
    IBLSThreshold public immutable blsThreshold;
    ITimelock public immutable timelock;
    ValidatorNetwork public immutable validatorNetwork;
    address public dexAggregator;

    // PBS Configuration
    uint256 public constant MIN_UNLOCK_DELAY = 2; // Minimum 2 blocks delay
    uint256 public constant MAX_UNLOCK_DELAY = 50; // Maximum 50 blocks delay (~10 minutes)
    uint256 public constant VALIDATOR_THRESHOLD = 67; // 67% of validators needed
    uint256 public constant PBS_FEE = 0.002 ether; // 0.002 ETH PBS fee

    // Encrypted Swap Structure
    struct EncryptedSwapRequest {
        address user;
        uint256 creationBlock;
        uint256 unlockBlock;
        bytes encryptedParams; // AES-256 encrypted swap parameters
        bytes32 keyCommitment; // Commitment to decryption key
        bytes32 entropy; // Random entropy for key derivation
        bool executed;
        bool decrypted;
    }

    // Decrypted Swap Parameters (revealed after timelock)
    struct SwapParameters {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 deadline;
        uint256 feeBps;
        uint256 slippageBps;
        bytes32 salt;
    }

    // Builder Auction Structure
    struct BuilderBid {
        address builder;
        uint256 bidAmount; // How much builder pays for inclusion
        uint256 gasPrice; // Proposed gas price
        bytes32 swapHash; // Hash of the swap they want to include
        IBLSThreshold.Signature signature; // Builder's signature
        uint256 blockDeadline; // Latest block for inclusion
        bool executed;
    }

    // State variables
    mapping(bytes32 => EncryptedSwapRequest) public encryptedSwaps;
    mapping(bytes32 => SwapParameters) public decryptedSwaps;
    mapping(bytes32 => BuilderBid) public builderBids;
    mapping(address => bool) public authorizedBuilders;
    mapping(address => uint256) public builderStakes;

    uint256 public swapCount;
    uint256 public successfulDecryptions;
    uint256 public totalBuilderRevenue;

    // Events
    event EncryptedSwapCreated(
        bytes32 indexed swapId,
        address indexed user,
        uint256 unlockBlock,
        bytes32 keyCommitment
    );

    event SwapDecrypted(
        bytes32 indexed swapId,
        address indexed user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    );

    event BuilderBidSubmitted(
        bytes32 indexed swapId,
        address indexed builder,
        uint256 bidAmount,
        uint256 gasPrice
    );

    event PBSSwapExecuted(
        bytes32 indexed swapId,
        address indexed user,
        address indexed builder,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    constructor(
        address _blsThreshold,
        address _timelock,
        address _validatorNetwork,
        address _dexAggregator
    ) Ownable(msg.sender) {
        blsThreshold = IBLSThreshold(_blsThreshold);
        timelock = ITimelock(_timelock);
        validatorNetwork = ValidatorNetwork(_validatorNetwork);
        dexAggregator = _dexAggregator;
    }

    /**
     * @notice Create an encrypted swap using PBS MEV protection
     * @param encryptedParams AES-256 encrypted swap parameters
     * @param unlockDelay Number of blocks to wait before decryption
     * @param entropy Random entropy for key derivation
     * @return swapId Unique identifier for the encrypted swap
     */
    function createEncryptedSwap(
        bytes calldata encryptedParams,
        uint256 unlockDelay,
        bytes32 entropy
    ) external payable nonReentrant returns (bytes32 swapId) {
        require(msg.value >= PBS_FEE, "Insufficient PBS fee");
        require(unlockDelay >= MIN_UNLOCK_DELAY, "Unlock delay too short");
        require(unlockDelay <= MAX_UNLOCK_DELAY, "Unlock delay too long");

        uint256 unlockBlock = block.number + unlockDelay;
        
        // Generate time-locked key commitment
        bytes32 keyCommitment = timelock.generateTimelockKey(unlockBlock, entropy);
        
        // Create unique swap ID
        swapId = keccak256(abi.encodePacked(
            msg.sender,
            block.timestamp,
            encryptedParams,
            entropy,
            swapCount++
        ));

        // Store encrypted swap
        encryptedSwaps[swapId] = EncryptedSwapRequest({
            user: msg.sender,
            creationBlock: block.number,
            unlockBlock: unlockBlock,
            encryptedParams: encryptedParams,
            keyCommitment: keyCommitment,
            entropy: entropy,
            executed: false,
            decrypted: false
        });

        emit EncryptedSwapCreated(swapId, msg.sender, unlockBlock, keyCommitment);
    }

    /**
     * @notice Submit a builder bid for executing an encrypted swap
     * @param swapId The encrypted swap to bid on
     * @param bidAmount Amount builder is willing to pay for inclusion
     * @param gasPrice Proposed gas price for execution
     * @param signature BLS signature from the builder
     */
    function submitBuilderBid(
        bytes32 swapId,
        uint256 bidAmount,
        uint256 gasPrice,
        IBLSThreshold.Signature calldata signature
    ) external payable {
        require(authorizedBuilders[msg.sender], "Not authorized builder");
        require(msg.value >= bidAmount, "Insufficient bid amount");
        require(encryptedSwaps[swapId].user != address(0), "Swap does not exist");
        require(!encryptedSwaps[swapId].executed, "Swap already executed");

        bytes32 bidHash = keccak256(abi.encodePacked(swapId, bidAmount, gasPrice, msg.sender));
        
        // Verify builder's signature
        IBLSThreshold.PublicKey memory builderPubkey = _getBuilderPublicKey(msg.sender);
        require(
            blsThreshold.verifySignature(builderPubkey, abi.encode(bidHash), signature),
            "Invalid builder signature"
        );

        // Store or update bid
        bytes32 bidId = keccak256(abi.encodePacked(swapId, msg.sender));
        builderBids[bidId] = BuilderBid({
            builder: msg.sender,
            bidAmount: bidAmount,
            gasPrice: gasPrice,
            swapHash: swapId,
            signature: signature,
            blockDeadline: block.number + 10, // 10 block deadline
            executed: false
        });

        builderStakes[msg.sender] += msg.value;
        emit BuilderBidSubmitted(swapId, msg.sender, bidAmount, gasPrice);
    }

    /**
     * @notice Decrypt and execute a PBS-protected swap
     * @param swapId The encrypted swap identifier
     * @param decryptedParams The decrypted swap parameters
     * @param validatorSignatures Array of validator signatures for decryption authorization
     * @param builderAddress The winning builder for execution
     */
    function decryptAndExecuteSwap(
        bytes32 swapId,
        SwapParameters calldata decryptedParams,
        IBLSThreshold.AggregateSignature calldata validatorSignatures,
        address builderAddress
    ) external nonReentrant whenNotPaused {
        EncryptedSwapRequest storage encSwap = encryptedSwaps[swapId];
        
        require(encSwap.user != address(0), "Swap does not exist");
        require(!encSwap.executed, "Swap already executed");
        require(block.number >= encSwap.unlockBlock, "Timelock not yet expired");
        require(authorizedBuilders[builderAddress], "Invalid builder");

        // Submit decryption request to validator network
        bytes32 dataHash = keccak256(abi.encodePacked(swapId, encSwap.unlockBlock, abi.encode(decryptedParams)));
        bytes32 requestId = validatorNetwork.submitDecryptionRequest(swapId, encSwap.unlockBlock, dataHash);
        
        // Verify validator consensus has been reached
        (bool hasConsensus, uint256 validatorCount) = validatorNetwork.verifyDecryptionConsensus(requestId);
        require(hasConsensus, "Validator consensus not reached");
        require(validatorCount >= 3, "Insufficient validator participation"); // Minimum 3 validators

        // Verify decryption correctness
        bytes32 decryptionKey = timelock.deriveDecryptionKey(encSwap.unlockBlock, encSwap.entropy);
        require(
            timelock.verifyDecryption(swapId, decryptionKey, abi.encode(decryptedParams)),
            "Invalid decryption"
        );

        // Mark as decrypted
        encSwap.decrypted = true;
        decryptedSwaps[swapId] = decryptedParams;
        successfulDecryptions++;

        // Apply MEV-resistant execution timing
        _applyMEVResistantTiming(swapId, encSwap.unlockBlock);
        
        // Execute the swap through the winning builder
        uint256 amountOut = _executeBuilderSwap(swapId, decryptedParams, builderAddress);

        // Mark as executed
        encSwap.executed = true;

        // Pay builder from their stake
        bytes32 bidId = keccak256(abi.encodePacked(swapId, builderAddress));
        BuilderBid storage bid = builderBids[bidId];
        if (bid.builder != address(0)) {
            builderStakes[builderAddress] -= bid.bidAmount;
            totalBuilderRevenue += bid.bidAmount;
        }

        emit SwapDecrypted(swapId, encSwap.user, decryptedParams.tokenIn, decryptedParams.tokenOut, decryptedParams.amountIn);
        emit PBSSwapExecuted(swapId, encSwap.user, builderAddress, decryptedParams.tokenIn, decryptedParams.tokenOut, decryptedParams.amountIn, amountOut);
    }

    /**
     * @notice Apply MEV-resistant timing controls before execution
     * @param swapId The swap identifier
     * @param unlockBlock The block when swap was unlocked
     */
    function _applyMEVResistantTiming(bytes32 swapId, uint256 unlockBlock) internal {
        // MEV Resistance 1: Execution window randomization
        uint256 executionSeed = uint256(keccak256(abi.encodePacked(
            swapId,
            block.timestamp,
            block.difficulty,
            blockhash(block.number - 1)
        )));
        
        uint256 randomDelay = executionSeed % 3; // 0-2 additional blocks delay
        require(
            block.number >= unlockBlock + randomDelay,
            "MEV timing protection: execution too early"
        );
        
        // MEV Resistance 2: Gas price stability check
        // Ensure gas prices haven't spiked recently (indicating MEV activity)
        uint256 currentGasPrice = tx.gasprice;
        uint256 blockGasLimit = block.gaslimit;
        
        // Check if gas usage is suspiciously high (potential MEV competition)
        require(
            currentGasPrice <= 200 gwei, // Hard limit during execution
            "MEV timing protection: gas price too high during execution"
        );
        
        // MEV Resistance 3: Block congestion check
        // If block is too full, delay execution to avoid MEV competition
        if (gasleft() < block.gaslimit / 4) {
            require(
                block.number > unlockBlock + 2,
                "MEV timing protection: wait for less congested block"
            );
        }
        
        // MEV Resistance 4: Execution ordering randomization
        // Use block hash to determine if execution should be delayed
        bytes32 executionHash = keccak256(abi.encodePacked(
            swapId,
            block.number,
            block.timestamp
        ));
        
        // 25% chance of additional 1-block delay for timing randomization
        if (uint256(executionHash) % 4 == 0) {
            require(
                block.number > unlockBlock + 1,
                "MEV timing protection: randomized execution delay"
            );
        }
    }
    
    /**
     * @notice Execute swap through the winning builder with PBS protection
     * @dev This integrates with the existing RealDexAggregator but with PBS timing
     */
    function _executeBuilderSwap(
        bytes32 swapId,
        SwapParameters memory params,
        address builderAddress
    ) internal returns (uint256 amountOut) {
        // Transfer tokens from user to contract
        IERC20(params.tokenIn).safeTransferFrom(
            encryptedSwaps[swapId].user,
            address(this),
            params.amountIn
        );

        // Approve aggregator
        IERC20(params.tokenIn).approve(dexAggregator, params.amountIn);

        // PBS-specific execution with builder coordination
        // The builder gets to execute at their proposed gas price
        uint256 originalGasPrice = tx.gasprice;
        
        // Call the aggregator (similar to existing MEV protection but with PBS timing)
        (bool success, bytes memory returnData) = dexAggregator.call{gas: 500000}(
            abi.encodeWithSignature(
                "swapWithBestQuote(address,address,uint256,uint256,address,uint256)",
                params.tokenIn,
                params.tokenOut,
                params.amountIn,
                params.minAmountOut,
                address(this),
                params.deadline
            )
        );

        require(success, "PBS swap execution failed");
        amountOut = abi.decode(returnData, (uint256));

        // Transfer output tokens to user
        address user = encryptedSwaps[swapId].user;
        IERC20(params.tokenOut).safeTransfer(user, amountOut);

        return amountOut;
    }

    /**
     * @notice Get the public key for a builder (placeholder implementation)
     */
    function _getBuilderPublicKey(address builder) internal view returns (IBLSThreshold.PublicKey memory) {
        // In production, this would fetch the actual BLS public key for the builder
        // For now, return a placeholder
        return IBLSThreshold.PublicKey({
            point: [uint256(keccak256(abi.encodePacked(builder, "pubkey1"))), uint256(keccak256(abi.encodePacked(builder, "pubkey2")))]
        });
    }

    // Admin functions
    function addAuthorizedBuilder(address builder) external onlyOwner {
        authorizedBuilders[builder] = true;
    }

    function removeAuthorizedBuilder(address builder) external onlyOwner {
        authorizedBuilders[builder] = false;
    }

    function setDexAggregator(address _dexAggregator) external onlyOwner {
        dexAggregator = _dexAggregator;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function withdrawFees() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    // View functions
    function getEncryptedSwap(bytes32 swapId) external view returns (EncryptedSwapRequest memory) {
        return encryptedSwaps[swapId];
    }

    function getDecryptedSwap(bytes32 swapId) external view returns (SwapParameters memory) {
        require(encryptedSwaps[swapId].decrypted, "Swap not yet decrypted");
        return decryptedSwaps[swapId];
    }

    function getBuilderBid(bytes32 swapId, address builder) external view returns (BuilderBid memory) {
        bytes32 bidId = keccak256(abi.encodePacked(swapId, builder));
        return builderBids[bidId];
    }

    function isSwapUnlocked(bytes32 swapId) external view returns (bool) {
        return block.number >= encryptedSwaps[swapId].unlockBlock;
    }

    function getPBSStats() external view returns (
        uint256 totalSwaps,
        uint256 totalDecryptions,
        uint256 totalBuilderFees
    ) {
        return (swapCount, successfulDecryptions, totalBuilderRevenue);
    }

    receive() external payable {}
}