// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IBLSThreshold - BLS Threshold Signatures Interface
 * @notice Interface for BLS threshold signature operations used in PBS
 * @dev Based on BLS12-381 curve for Ethereum 2.0 compatibility
 */
interface IBLSThreshold {
    struct PublicKey {
        uint256[2] point; // G1 point on BLS12-381
    }

    struct Signature {
        uint256[2] point; // G1 point on BLS12-381
    }

    struct AggregateSignature {
        uint256[2] point; // G1 point
        uint256 signersMask; // Bitmap of signers
    }

    /**
     * @notice Verify a BLS signature
     * @param pubkey Public key of the signer
     * @param message Message that was signed
     * @param signature BLS signature to verify
     * @return True if signature is valid
     */
    function verifySignature(
        PublicKey calldata pubkey,
        bytes calldata message,
        Signature calldata signature
    ) external view returns (bool);

    /**
     * @notice Verify an aggregated BLS signature from multiple validators
     * @param pubkeys Array of public keys from validators
     * @param message Message that was signed
     * @param aggSig Aggregated signature
     * @param threshold Minimum number of required signatures
     * @return True if aggregated signature meets threshold
     */
    function verifyAggregateSignature(
        PublicKey[] calldata pubkeys,
        bytes calldata message,
        AggregateSignature calldata aggSig,
        uint256 threshold
    ) external view returns (bool);

    /**
     * @notice Get the current validator set for PBS
     * @return pubkeys Array of validator public keys
     * @return weights Voting weights of each validator
     * @return threshold Current threshold requirement
     */
    function getValidatorSet() external view returns (
        PublicKey[] memory pubkeys,
        uint256[] memory weights,
        uint256 threshold
    );
}