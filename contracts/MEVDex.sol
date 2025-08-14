// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MEVDex - MEV-Protected DEX with Commit-Reveal Pattern
 * @notice Implements a commit-reveal pattern to prevent front-running and MEV attacks
 * @dev Uses keccak256 commitments to hide swap intentions until execution
 */
contract MEVDex is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    // Events
    event SwapCommitted(
        bytes32 indexed commitment,
        address indexed user,
        uint256 timestamp
    );

    event SwapRevealed(
        bytes32 indexed commitment,
        address indexed user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 timestamp
    );

    event SwapExecuted(
        bytes32 indexed commitment,
        address indexed user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 timestamp
    );

    // Structs
    struct SwapCommitment {
        address user;
        uint256 timestamp;
        bool revealed;
        bool executed;
    }

    struct SwapRequest {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 deadline;
        bytes32 salt;
        uint256 feeBps; // Configurable fee in basis points
        uint256 slippageBps; // Configurable slippage in basis points
    }

    // State variables
    mapping(bytes32 => SwapCommitment) public commitments;
    mapping(address => uint256) public userCommitmentCount;

    uint256 public constant COMMITMENT_TIMEOUT = 1 hours;
    uint256 public constant MAX_SLIPPAGE_BPS = 500; // 5% - increased for flexibility
    uint256 public constant MIN_SLIPPAGE_BPS = 5; // 0.05% - minimum slippage
    uint256 public constant MAX_FEE_BPS = 500; // 5% - maximum fee
    uint256 public constant MIN_FEE_BPS = 5; // 0.05% - minimum fee

    uint256 public defaultFeeBps = 30; // 0.3% default fee
    uint256 public defaultSlippageBps = 300; // 3% default slippage

    // DEX aggregator addresses (can be updated by owner)
    address public dexAggregator;

    // Modifiers
    modifier onlyValidCommitment(bytes32 commitment) {
        require(
            commitments[commitment].user != address(0),
            "Invalid commitment"
        );
        require(
            !commitments[commitment].executed,
            "Commitment already executed"
        );
        _;
    }

    modifier onlyCommitmentOwner(bytes32 commitment) {
        require(
            commitments[commitment].user == msg.sender,
            "Not commitment owner"
        );
        _;
    }

    modifier onlyValidDeadline(uint256 deadline) {
        require(deadline > block.timestamp, "Deadline expired");
        _;
    }

    // Constructor
    constructor(address _dexAggregator) Ownable(msg.sender) {
        dexAggregator = _dexAggregator;
    }

    /**
     * @notice Commit to a swap by providing a commitment hash
     * @param commitment The keccak256 hash of the swap parameters
     */
    function commitSwap(bytes32 commitment) external payable {
        require(
            commitments[commitment].user == address(0),
            "Commitment already exists"
        );
        require(msg.value >= 0.001 ether, "Insufficient commitment fee");

        commitments[commitment] = SwapCommitment({
            user: msg.sender,
            timestamp: block.timestamp,
            revealed: false,
            executed: false
        });

        userCommitmentCount[msg.sender]++;

        emit SwapCommitted(commitment, msg.sender, block.timestamp);
    }

    /**
     * @notice Reveal swap parameters and execute the swap
     * @param swapRequest The swap parameters
     * @param commitment The commitment hash
     */
    function revealAndSwap(
        SwapRequest calldata swapRequest,
        bytes32 commitment
    )
        external
        nonReentrant
        onlyValidCommitment(commitment)
        onlyCommitmentOwner(commitment)
        onlyValidDeadline(swapRequest.deadline)
    {
        require(!commitments[commitment].revealed, "Already revealed");

        // Validate fee and slippage parameters
        require(
            swapRequest.feeBps >= MIN_FEE_BPS &&
                swapRequest.feeBps <= MAX_FEE_BPS,
            "Invalid fee"
        );
        require(
            swapRequest.slippageBps >= MIN_SLIPPAGE_BPS &&
                swapRequest.slippageBps <= MAX_SLIPPAGE_BPS,
            "Invalid slippage"
        );

        // Verify the commitment matches the revealed parameters
        bytes32 expectedCommitment = keccak256(
            abi.encodePacked(
                swapRequest.tokenIn,
                swapRequest.tokenOut,
                swapRequest.amountIn,
                swapRequest.minAmountOut,
                swapRequest.deadline,
                swapRequest.salt,
                swapRequest.feeBps,
                swapRequest.slippageBps,
                msg.sender
            )
        );

        require(commitment == expectedCommitment, "Invalid commitment");

        // Mark as revealed
        commitments[commitment].revealed = true;

        // Transfer tokens from user to contract
        IERC20(swapRequest.tokenIn).safeTransferFrom(
            msg.sender,
            address(this),
            swapRequest.amountIn
        );

        // Calculate fee
        uint256 feeAmount = (swapRequest.amountIn * swapRequest.feeBps) / 10000;
        uint256 swapAmount = swapRequest.amountIn - feeAmount;

        // Execute swap through DEX aggregator (simplified - in practice, you'd call actual DEX)
        uint256 amountOut = _executeSwap(
            swapRequest.tokenIn,
            swapRequest.tokenOut,
            swapAmount,
            swapRequest.minAmountOut
        );

        // Mark as executed
        commitments[commitment].executed = true;

        // Transfer output tokens to user
        IERC20(swapRequest.tokenOut).safeTransfer(msg.sender, amountOut);

        // Transfer fee to owner
        if (feeAmount > 0) {
            IERC20(swapRequest.tokenIn).safeTransfer(owner(), feeAmount);
        }

        emit SwapRevealed(
            commitment,
            msg.sender,
            swapRequest.tokenIn,
            swapRequest.tokenOut,
            swapRequest.amountIn,
            amountOut,
            block.timestamp
        );

        emit SwapExecuted(
            commitment,
            msg.sender,
            swapRequest.tokenIn,
            swapRequest.tokenOut,
            swapRequest.amountIn,
            amountOut,
            block.timestamp
        );
    }

    /**
     * @notice Cancel a commitment if it hasn't been revealed within timeout
     * @param commitment The commitment hash to cancel
     */
    function cancelCommitment(
        bytes32 commitment
    ) external onlyValidCommitment(commitment) onlyCommitmentOwner(commitment) {
        require(!commitments[commitment].revealed, "Already revealed");
        require(
            block.timestamp >
                commitments[commitment].timestamp + COMMITMENT_TIMEOUT,
            "Commitment not yet expired"
        );

        delete commitments[commitment];
        userCommitmentCount[msg.sender]--;

        // Refund commitment fee
        payable(msg.sender).transfer(0.001 ether);
    }

    /**
     * @notice Execute swap through DEX aggregator (simplified implementation)
     * @dev In practice, this would integrate with 1inch, 0x, or other DEX aggregators
     */
    function _executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) internal returns (uint256 amountOut) {
        // This is a simplified implementation
        // In practice, you would:
        // 1. Call the DEX aggregator's swap function
        // 2. Handle the actual token swaps
        // 3. Return the actual amount received

        // For now, we'll simulate a swap with a fixed exchange rate
        // In production, replace this with actual DEX integration
        amountOut = (amountIn * 95) / 100; // 5% slippage simulation

        require(amountOut >= minAmountOut, "Insufficient output amount");

        return amountOut;
    }

    // Admin functions
    function setDefaultFeeBps(uint256 _defaultFeeBps) external onlyOwner {
        require(
            _defaultFeeBps >= MIN_FEE_BPS && _defaultFeeBps <= MAX_FEE_BPS,
            "Invalid default fee"
        );
        defaultFeeBps = _defaultFeeBps;
    }

    function setDefaultSlippageBps(
        uint256 _defaultSlippageBps
    ) external onlyOwner {
        require(
            _defaultSlippageBps >= MIN_SLIPPAGE_BPS &&
                _defaultSlippageBps <= MAX_SLIPPAGE_BPS,
            "Invalid default slippage"
        );
        defaultSlippageBps = _defaultSlippageBps;
    }

    function setDexAggregator(address _dexAggregator) external onlyOwner {
        require(_dexAggregator != address(0), "Invalid address");
        dexAggregator = _dexAggregator;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function withdrawFees(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).safeTransfer(owner(), balance);
        }
    }

    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            payable(owner()).transfer(balance);
        }
    }

    // View functions
    function getCommitment(
        bytes32 commitment
    )
        external
        view
        returns (address user, uint256 timestamp, bool revealed, bool executed)
    {
        SwapCommitment memory c = commitments[commitment];
        return (c.user, c.timestamp, c.revealed, c.executed);
    }

    function isCommitmentValid(
        bytes32 commitment
    ) external view returns (bool) {
        return
            commitments[commitment].user != address(0) &&
            !commitments[commitment].executed &&
            block.timestamp <=
            commitments[commitment].timestamp + COMMITMENT_TIMEOUT;
    }

    // Helper functions for frontend
    function getDefaultParameters()
        external
        view
        returns (uint256 fee, uint256 slippage)
    {
        return (defaultFeeBps, defaultSlippageBps);
    }

    function getParameterLimits()
        external
        view
        returns (
            uint256 minFee,
            uint256 maxFee,
            uint256 minSlippage,
            uint256 maxSlippage
        )
    {
        return (MIN_FEE_BPS, MAX_FEE_BPS, MIN_SLIPPAGE_BPS, MAX_SLIPPAGE_BPS);
    }

    function calculateCommitment(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline,
        bytes32 salt,
        uint256 feeBps,
        uint256 slippageBps,
        address user
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    tokenIn,
                    tokenOut,
                    amountIn,
                    minAmountOut,
                    deadline,
                    salt,
                    feeBps,
                    slippageBps,
                    user
                )
            );
    }

    // Emergency functions
    function emergencyWithdraw(address token, address to) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).safeTransfer(to, balance);
        }
    }

    // Receive function for ETH
    receive() external payable {}
}
