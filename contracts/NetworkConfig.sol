// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title NetworkConfig - Easy Network Switching
 * @notice Centralized configuration for different networks
 * @dev Change these addresses to switch between testnet and mainnet
 */
contract NetworkConfig {
    // ===== SEPOLIA TESTNET CONFIGURATION =====
    // Uncomment and use these for Sepolia deployment
    address public constant SEPOLIA_UNISWAP_V2_ROUTER =
        0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address public constant SEPOLIA_UNISWAP_V3_ROUTER =
        0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address public constant SEPOLIA_SUSHISWAP_ROUTER =
        0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F;
    address public constant SEPOLIA_WETH =
        0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9;

    // ===== MAINNET CONFIGURATION =====
    // Uncomment and use these for mainnet deployment
    // address public constant MAINNET_UNISWAP_V2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    // address public constant MAINNET_UNISWAP_V3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    // address public constant MAINNET_SUSHISWAP_ROUTER = 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F;
    // address public constant MAINNET_WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    // ===== POLYGON CONFIGURATION =====
    // Uncomment and use these for Polygon deployment
    // address public constant POLYGON_UNISWAP_V2_ROUTER = 0xa5E0829CaCEd8fFDD4De3c74796aF668a5803888;
    // address public constant POLYGON_UNISWAP_V3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    // address public constant POLYGON_SUSHISWAP_ROUTER = 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506;
    // address public constant POLYGON_WMATIC = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;

    // ===== ARBITRUM CONFIGURATION =====
    // Uncomment and use these for Arbitrum deployment
    // address public constant ARBITRUM_UNISWAP_V2_ROUTER = 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506;
    // address public constant ARBITRUM_UNISWAP_V3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    // address public constant ARBITRUM_SUSHISWAP_ROUTER = 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506;
    // address public constant ARBITRUM_WETH = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;

    // ===== OPTIMISM CONFIGURATION =====
    // Uncomment and use these for Optimism deployment
    // address public constant OPTIMISM_UNISWAP_V2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    // address public constant OPTIMISM_UNISWAP_V3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    // address public constant OPTIMISM_SUSHISWAP_ROUTER = 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506;
    // address public constant OPTIMISM_WETH = 0x4200000000000000000000000000000000000006;

    // ===== DEPLOYMENT INSTRUCTIONS =====
    /*
    TO DEPLOY ON MAINNET:
    1. Comment out the SEPOLIA constants above
    2. Uncomment the MAINNET constants above
    3. Deploy the contracts
    4. The system will automatically use mainnet addresses
    
    TO DEPLOY ON OTHER NETWORKS:
    1. Follow the same pattern for your target network
    2. Update the router addresses and WETH/WMATIC addresses
    3. Deploy and test
    
    NETWORK-SPECIFIC CONSIDERATIONS:
    - Sepolia: Use testnet addresses, lower gas limits
    - Mainnet: Use production addresses, higher gas limits
    - L2s: Consider gas token differences (WETH vs WMATIC)
    - Test thoroughly on testnet before mainnet deployment
    */
}
