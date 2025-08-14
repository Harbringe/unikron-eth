// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MainnetConfig - Easy Mainnet Deployment
 * @notice Configuration for mainnet deployment - just change one variable
 * @dev To deploy on mainnet: change MAINNET_DEPLOYMENT = true
 */
contract MainnetConfig {
    // ===== MAINNET DEPLOYMENT FLAG =====
    // Change this to true for mainnet deployment
    bool public constant MAINNET_DEPLOYMENT = false;

    // ===== SEPOLIA TESTNET ADDRESSES =====
    address public constant SEPOLIA_UNISWAP_V2_ROUTER =
        0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address public constant SEPOLIA_UNISWAP_V3_ROUTER =
        0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address public constant SEPOLIA_WETH =
        0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9;

    // ===== MAINNET ADDRESSES =====
    address public constant MAINNET_UNISWAP_V2_ROUTER =
        0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address public constant MAINNET_UNISWAP_V3_ROUTER =
        0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address public constant MAINNET_WETH =
        0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    // ===== NETWORK SELECTION =====
    function getUniswapV2Router() public pure returns (address) {
        return
            MAINNET_DEPLOYMENT
                ? MAINNET_UNISWAP_V2_ROUTER
                : SEPOLIA_UNISWAP_V2_ROUTER;
    }

    function getUniswapV3Router() public pure returns (address) {
        return
            MAINNET_DEPLOYMENT
                ? MAINNET_UNISWAP_V3_ROUTER
                : SEPOLIA_UNISWAP_V3_ROUTER;
    }

    function getWethAddress() public pure returns (address) {
        return MAINNET_DEPLOYMENT ? MAINNET_WETH : SEPOLIA_WETH;
    }

    function isMainnet() public pure returns (bool) {
        return MAINNET_DEPLOYMENT;
    }

    // ===== DEPLOYMENT INSTRUCTIONS =====
    /*
    TO DEPLOY ON MAINNET:
    1. Change MAINNET_DEPLOYMENT = true above
    2. Deploy the contracts
    3. The system will automatically use mainnet addresses
    
    TO DEPLOY ON SEPOLIA:
    1. Keep MAINNET_DEPLOYMENT = false above
    2. Deploy the contracts
    3. The system will automatically use Sepolia addresses
    
    THAT'S IT! Just one variable change for mainnet deployment.
    */
}
