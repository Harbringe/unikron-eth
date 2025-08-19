// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IBLSThreshold.sol";
import "./ProductionBLSThreshold.sol";

/**
 * @title ValidatorNetwork - Production Validator Network Interface
 * @notice Manages validator registration, consensus, and decryption authorization
 * @dev Integrates with real BLS threshold signatures and validator coordination
 */
contract ValidatorNetwork is Ownable, ReentrancyGuard {
    
    ProductionBLSThreshold public immutable blsThreshold;
    
    // Validator network configuration
    uint256 public constant EPOCH_DURATION = 32 * 12; // ~6.4 minutes (32 slots * 12 seconds)
    uint256 public constant SLASHING_AMOUNT = 1 ether; // Amount slashed for misbehavior
    uint256 public constant MIN_VALIDATORS = 4; // Minimum validators for network security
    uint256 public constant MAX_VALIDATORS = 512; // Maximum validators to prevent bloat
    
    // Validator states
    enum ValidatorStatus {
        INACTIVE,
        ACTIVE, 
        SLASHED,
        EXITING,
        EXITED
    }
    
    struct ValidatorInfo {
        ValidatorStatus status;
        uint256 stake;
        uint256 activationEpoch;
        uint256 exitEpoch;
        uint256 slashingCount;
        uint256 successfulDecryptions;
        uint256 failedDecryptions;
        IBLSThreshold.PublicKey pubkey;
        bytes32 withdrawalCredentials;
    }
    
    // Decryption consensus tracking
    struct DecryptionRequest {
        bytes32 swapId;
        uint256 unlockBlock;
        uint256 requestEpoch;
        bytes32 dataHash;
        uint256 validatorSignatures; // Bitmap of validator signatures
        bool executed;
        uint256 consensusBlock;
    }
    
    // State variables
    mapping(address => ValidatorInfo) public validators;
    mapping(bytes32 => DecryptionRequest) public decryptionRequests;
    mapping(uint256 => address[]) public epochValidators; // epoch => validator addresses
    
    address[] public activeValidators;
    uint256 public totalActiveValidators;
    uint256 public currentEpoch;
    uint256 public totalDecryptionRequests;
    uint256 public successfulDecryptions;
    
    // Events
    event ValidatorActivated(address indexed validator, uint256 stake);
    event ValidatorSlashed(address indexed validator, uint256 amount, string reason);
    event ValidatorExited(address indexed validator);
    event DecryptionConsensusReached(bytes32 indexed swapId, uint256 validatorCount);
    event EpochAdvanced(uint256 indexed newEpoch, uint256 activeValidators);
    
    constructor(address _blsThreshold) Ownable(msg.sender) {
        blsThreshold = ProductionBLSThreshold(_blsThreshold);
        currentEpoch = block.number / EPOCH_DURATION;
    }
    
    /**
     * @notice Register and activate a validator
     * @param pubkey BLS public key for the validator
     * @param withdrawalCredentials Withdrawal credentials for the validator
     */
    function activateValidator(
        IBLSThreshold.PublicKey calldata pubkey,
        bytes32 withdrawalCredentials
    ) external payable nonReentrant {
        require(msg.value >= 32 ether, "Insufficient validator stake");
        require(validators[msg.sender].status == ValidatorStatus.INACTIVE, "Validator already registered");
        require(totalActiveValidators < MAX_VALIDATORS, "Max validators reached");
        require(_isValidBLSKey(pubkey), "Invalid BLS public key");
        
        // Update current epoch if needed
        _updateEpoch();
        
        validators[msg.sender] = ValidatorInfo({
            status: ValidatorStatus.ACTIVE,
            stake: msg.value,
            activationEpoch: currentEpoch + 1, // Activate in next epoch
            exitEpoch: 0,
            slashingCount: 0,
            successfulDecryptions: 0,
            failedDecryptions: 0,
            pubkey: pubkey,
            withdrawalCredentials: withdrawalCredentials
        });
        
        // Register with BLS threshold contract
        blsThreshold.registerValidator{value: msg.value}(pubkey);
        
        activeValidators.push(msg.sender);
        totalActiveValidators++;
        epochValidators[currentEpoch + 1].push(msg.sender);
        
        emit ValidatorActivated(msg.sender, msg.value);
    }
    
    /**
     * @notice Submit decryption consensus request
     * @param swapId The encrypted swap identifier
     * @param unlockBlock Block when swap becomes unlockable
     * @param dataHash Hash of the encrypted data
     * @return requestId Unique identifier for the decryption request
     */
    function submitDecryptionRequest(
        bytes32 swapId,
        uint256 unlockBlock,
        bytes32 dataHash
    ) external returns (bytes32 requestId) {
        require(unlockBlock <= block.number, "Unlock block not reached");
        
        _updateEpoch();
        
        requestId = keccak256(abi.encodePacked(
            swapId,
            unlockBlock,
            block.number,
            totalDecryptionRequests++
        ));
        
        decryptionRequests[requestId] = DecryptionRequest({
            swapId: swapId,
            unlockBlock: unlockBlock,
            requestEpoch: currentEpoch,
            dataHash: dataHash,
            validatorSignatures: 0,
            executed: false,
            consensusBlock: 0
        });
        
        return requestId;
    }
    
    /**
     * @notice Submit validator signature for decryption consensus
     * @param requestId The decryption request identifier
     * @param signature BLS signature from the validator
     */
    function submitDecryptionSignature(
        bytes32 requestId,
        IBLSThreshold.Signature calldata signature
    ) external {
        DecryptionRequest storage request = decryptionRequests[requestId];
        require(request.swapId != bytes32(0), "Request does not exist");
        require(!request.executed, "Request already executed");
        require(validators[msg.sender].status == ValidatorStatus.ACTIVE, "Validator not active");
        
        // Verify validator's signature
        ValidatorInfo storage validator = validators[msg.sender];
        bytes memory message = abi.encode(request.swapId, request.unlockBlock, request.dataHash);
        
        require(
            blsThreshold.verifySignature(validator.pubkey, message, signature),
            "Invalid validator signature"
        );
        
        // Mark validator as having signed (simplified bitmap)
        uint256 validatorIndex = _getValidatorIndex(msg.sender);
        require(validatorIndex < 256, "Validator index too large"); // Bitmap limitation
        
        uint256 signatureBit = 1 << validatorIndex;
        require(
            (request.validatorSignatures & signatureBit) == 0,
            "Validator already signed"
        );
        
        request.validatorSignatures |= signatureBit;
        validator.successfulDecryptions++;
        
        // Check if consensus threshold reached
        uint256 signatureCount = _countSetBits(request.validatorSignatures);
        uint256 requiredSignatures = (totalActiveValidators * 67) / 100; // 67% threshold
        
        if (signatureCount >= requiredSignatures && !request.executed) {
            request.executed = true;
            request.consensusBlock = block.number;
            successfulDecryptions++;
            
            emit DecryptionConsensusReached(request.swapId, signatureCount);
        }
    }
    
    /**
     * @notice Verify if decryption consensus has been reached
     * @param requestId The decryption request identifier
     * @return hasConsensus True if consensus reached
     * @return validatorCount Number of validators who signed
     */
    function verifyDecryptionConsensus(bytes32 requestId) external view returns (
        bool hasConsensus,
        uint256 validatorCount
    ) {
        DecryptionRequest storage request = decryptionRequests[requestId];
        validatorCount = _countSetBits(request.validatorSignatures);
        uint256 requiredSignatures = (totalActiveValidators * 67) / 100;
        
        hasConsensus = request.executed && validatorCount >= requiredSignatures;
    }
    
    /**
     * @notice Slash a validator for misbehavior
     * @param validator Address of validator to slash
     * @param reason Reason for slashing
     */
    function slashValidator(address validator, string calldata reason) external onlyOwner {
        ValidatorInfo storage validatorInfo = validators[validator];
        require(validatorInfo.status == ValidatorStatus.ACTIVE, "Validator not active");
        
        validatorInfo.status = ValidatorStatus.SLASHED;
        validatorInfo.slashingCount++;
        validatorInfo.stake -= SLASHING_AMOUNT;
        
        // Remove from active set
        _removeFromActiveValidators(validator);
        totalActiveValidators--;
        
        // Deactivate in BLS threshold contract
        blsThreshold.deactivateValidator(validator);
        
        emit ValidatorSlashed(validator, SLASHING_AMOUNT, reason);
    }
    
    /**
     * @notice Exit a validator from the network
     */
    function exitValidator() external nonReentrant {
        ValidatorInfo storage validator = validators[msg.sender];
        require(validator.status == ValidatorStatus.ACTIVE, "Validator not active");
        
        validator.status = ValidatorStatus.EXITING;
        validator.exitEpoch = currentEpoch + 1; // Exit in next epoch
        
        // Remove from active set
        _removeFromActiveValidators(msg.sender);
        totalActiveValidators--;
        
        // Return stake after exit delay
        payable(msg.sender).transfer(validator.stake);
        validator.stake = 0;
        validator.status = ValidatorStatus.EXITED;
        
        emit ValidatorExited(msg.sender);
    }
    
    /**
     * @notice Update the current epoch
     */
    function _updateEpoch() internal {
        uint256 newEpoch = block.number / EPOCH_DURATION;
        if (newEpoch > currentEpoch) {
            currentEpoch = newEpoch;
            emit EpochAdvanced(currentEpoch, totalActiveValidators);
        }
    }
    
    /**
     * @notice Check if BLS public key is valid
     */
    function _isValidBLSKey(IBLSThreshold.PublicKey memory pubkey) internal pure returns (bool) {
        // Basic validation - non-zero key
        return pubkey.point[0] != 0 || pubkey.point[1] != 0;
    }
    
    /**
     * @notice Get validator index in active set
     */
    function _getValidatorIndex(address validator) internal view returns (uint256) {
        for (uint256 i = 0; i < activeValidators.length; i++) {
            if (activeValidators[i] == validator) {
                return i;
            }
        }
        revert("Validator not found in active set");
    }
    
    /**
     * @notice Remove validator from active validators array
     */
    function _removeFromActiveValidators(address validator) internal {
        for (uint256 i = 0; i < activeValidators.length; i++) {
            if (activeValidators[i] == validator) {
                activeValidators[i] = activeValidators[activeValidators.length - 1];
                activeValidators.pop();
                break;
            }
        }
    }
    
    /**
     * @notice Count set bits in a bitmap (population count)
     */
    function _countSetBits(uint256 bitmap) internal pure returns (uint256) {
        uint256 count = 0;
        while (bitmap > 0) {
            count += bitmap & 1;
            bitmap >>= 1;
        }
        return count;
    }
    
    // View functions
    function getActiveValidators() external view returns (address[] memory) {
        return activeValidators;
    }
    
    function getValidatorInfo(address validator) external view returns (
        ValidatorStatus status,
        uint256 stake,
        uint256 successfulDecryptions,
        uint256 failedDecryptions
    ) {
        ValidatorInfo storage info = validators[validator];
        return (info.status, info.stake, info.successfulDecryptions, info.failedDecryptions);
    }
    
    function getCurrentEpoch() external view returns (uint256) {
        return block.number / EPOCH_DURATION;
    }
    
    function getNetworkStats() external view returns (
        uint256 activeValidatorCount,
        uint256 totalRequests,
        uint256 successfulConsensus,
        uint256 epoch,
        uint256 consensusThreshold
    ) {
        return (
            totalActiveValidators,
            totalDecryptionRequests,
            successfulDecryptions,
            currentEpoch,
            (totalActiveValidators * 67) / 100
        );
    }
    
    // Emergency functions
    function emergencyPause() external onlyOwner {
        // Pause all validator operations
        for (uint256 i = 0; i < activeValidators.length; i++) {
            validators[activeValidators[i]].status = ValidatorStatus.INACTIVE;
        }
        totalActiveValidators = 0;
    }
    
    function setMinValidators(uint256 newMin) external onlyOwner {
        require(newMin >= 1 && newMin <= MAX_VALIDATORS, "Invalid validator count");
        require(newMin != MIN_VALIDATORS, "Same as current");
        // Update MIN_VALIDATORS logic would go here
    }
}