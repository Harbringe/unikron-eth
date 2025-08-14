import { ethers } from "hardhat";

async function main() {
    console.log("Deploying MEV-Protected DEX contracts...");

    // Get the deployer account
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());

    // Deploy MockERC20 tokens for testing
    console.log("\nDeploying MockERC20 tokens...");

    const MockERC20 = await ethers.getContractFactory("MockERC20");

    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6, 1000000); // 1M USDC
    await usdc.deployed();
    console.log("USDC deployed to:", usdc.address);

    const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18, 10000); // 10K WETH
    await weth.deployed();
    console.log("WETH deployed to:", weth.address);

    const dai = await MockERC20.deploy("Dai Stablecoin", "DAI", 18, 1000000); // 1M DAI
    await dai.deployed();
    console.log("DAI deployed to:", dai.address);

    // Deploy MEVDex contract
    console.log("\nDeploying MEVDex contract...");

    // For now, we'll use a zero address as DEX aggregator (can be updated later)
    const zeroAddress = "0x0000000000000000000000000000000000000000";

    const MEVDex = await ethers.getContractFactory("MEVDex");
    const mevDex = await MEVDex.deploy(zeroAddress);
    await mevDex.deployed();

    console.log("MEVDex deployed to:", mevDex.address);

    // Mint some tokens to the deployer for testing
    console.log("\nMinting test tokens...");

    const usdcAmount = ethers.utils.parseUnits("10000", 6); // 10K USDC
    const wethAmount = ethers.utils.parseUnits("100", 18); // 100 WETH
    const daiAmount = ethers.utils.parseUnits("10000", 18); // 10K DAI

    await usdc.mint(deployer.address, usdcAmount);
    await weth.mint(deployer.address, wethAmount);
    await dai.mint(deployer.address, daiAmount);

    console.log("Minted tokens to deployer for testing");

    // Print deployment summary
    console.log("\n=== Deployment Summary ===");
    console.log("Network:", (await ethers.provider.getNetwork()).name);
    console.log("Deployer:", deployer.address);
    console.log("USDC:", usdc.address);
    console.log("WETH:", weth.address);
    console.log("DAI:", dai.address);
    console.log("MEVDex:", mevDex.address);
    console.log("========================\n");

    // Save deployment addresses to a file
    const deploymentInfo = {
        network: (await ethers.provider.getNetwork()).name,
        deployer: deployer.address,
        contracts: {
            usdc: usdc.address,
            weth: weth.address,
            dai: dai.address,
            mevDex: mevDex.address
        },
        timestamp: new Date().toISOString()
    };

    const fs = require('fs');
    fs.writeFileSync(
        'deployment.json',
        JSON.stringify(deploymentInfo, null, 2)
    );

    console.log("Deployment info saved to deployment.json");
    console.log("\nTo use these contracts, update your .env file with:");
    console.log(`CONTRACT_ADDRESS=${mevDex.address}`);
    console.log(`USDC_ADDRESS=${usdc.address}`);
    console.log(`WETH_ADDRESS=${weth.address}`);
    console.log(`DAI_ADDRESS=${dai.address}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
