// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ITimelock - Time-locked Encryption Interface  
 * @notice Interface for time-locked encryption used in PBS MEV protection
 * @dev Implements time-locked encryption where data can only be decrypted after a specific block
 */
interface ITimelock {
    struct EncryptedData {
        bytes ciphertext; // AES-256-GCM encrypted data
        bytes32 keyCommitment; // Commitment to the decryption key
        uint256 unlockBlock; // Block number when decryption becomes possible
        bytes32 entropy; // Random entropy for key derivation
    }

    struct TimelockedSwap {
        EncryptedData encryptedParams; // Encrypted swap parameters
        address user; // User who created the timelock
        uint256 creationBlock; // Block when timelock was created
        uint256 unlockBlock; // Block when decryption is possible
        bool executed; // Whether swap has been executed
        bytes32 paramHash; // Hash of decrypted parameters (for verification)
    }

    /**
     * @notice Create a time-locked encryption of swap parameters
     * @param swapParams Plaintext swap parameters to encrypt
     * @param unlockDelay Number of blocks to wait before unlock
     * @return encryptedData The time-locked encrypted data
     * @return timelockId Unique identifier for this timelock
     */
    function createTimelock(
        bytes calldata swapParams,
        uint256 unlockDelay
    ) external returns (EncryptedData memory encryptedData, bytes32 timelockId);

    /**
     * @notice Verify that encrypted data can be decrypted at the unlock block
     * @param timelockId Identifier of the timelock
     * @param decryptionKey Key used for decryption
     * @param decryptedParams The claimed decrypted parameters
     * @return True if decryption is valid and block height requirement is met
     */
    function verifyDecryption(
        bytes32 timelockId,
        bytes32 decryptionKey,
        bytes calldata decryptedParams
    ) external view returns (bool);

    /**
     * @notice Get time-locked swap details
     * @param timelockId Identifier of the timelock
     * @return timelockedSwap The timelock details
     */
    function getTimelock(bytes32 timelockId) external view returns (TimelockedSwap memory);

    /**
     * @notice Check if a timelock is ready for decryption
     * @param timelockId Identifier of the timelock
     * @return True if current block >= unlock block
     */
    function isUnlocked(bytes32 timelockId) external view returns (bool);

    /**
     * @notice Generate a time-locked encryption key based on future block hash
     * @param unlockBlock Block number for future unlock
     * @param entropy Random entropy for key uniqueness
     * @return keyCommitment Commitment to the future key
     */
    function generateTimelockKey(
        uint256 unlockBlock,
        bytes32 entropy
    ) external pure returns (bytes32 keyCommitment);

    /**
     * @notice Derive the actual decryption key from block hash (can only be done after unlock)
     * @param unlockBlock The block number that was used for timelock
     * @param entropy The entropy that was used
     * @return decryptionKey The actual AES key for decryption
     */
    function deriveDecryptionKey(
        uint256 unlockBlock,
        bytes32 entropy
    ) external view returns (bytes32 decryptionKey);

    // Events
    event TimelockCreated(
        bytes32 indexed timelockId,
        address indexed user,
        uint256 unlockBlock,
        bytes32 keyCommitment
    );

    event TimelockDecrypted(
        bytes32 indexed timelockId,
        address indexed executor,
        bytes32 paramHash
    );
}