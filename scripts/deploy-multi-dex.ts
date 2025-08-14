import { ethers } from "hardhat";

async function main() {
    console.log("🚀 Deploying Multi-DEX Aggregator...");

    // Get the deployer account
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());

    // Deploy MultiDexAggregator
    console.log("\n📦 Deploying MultiDexAggregator...");

    const MultiDexAggregator = await ethers.getContractFactory("MultiDexAggregator");
    const multiDex = await MultiDexAggregator.deploy();
    await multiDex.waitForDeployment();

    console.log("✅ MultiDexAggregator deployed to:", await multiDex.getAddress());

    // Get supported DEXs
    console.log("\n🔍 Checking supported DEXs...");
    const supportedDexs = await multiDex.getSupportedDexs();
    console.log("Supported DEXs:", supportedDexs);

    // Test getting quotes (simulated)
    console.log("\n📊 Testing quote functionality...");
    const testTokenIn = "0x0000000000000000000000000000000000000001";
    const testTokenOut = "0x0000000000000000000000000000000000000002";
    const testAmount = ethers.parseEther("1.0");

    try {
        const quotes = await multiDex.getAllQuotes(testTokenIn, testTokenOut, testAmount);
        console.log(`✅ Got ${quotes.length} quotes from all DEXs`);

        const bestQuote = await multiDex.getBestQuote(testTokenIn, testTokenOut, testAmount);
        console.log(`🏆 Best quote: ${bestQuote.dexName} - Amount Out: ${ethers.formatEther(bestQuote.amountOut)}`);
    } catch (error) {
        console.log("⚠️  Quote test failed (expected in simulation mode):", error);
    }

    // Print deployment summary
    console.log("\n=== Deployment Summary ===");
    console.log("Network:", (await ethers.provider.getNetwork()).name);
    console.log("Deployer:", deployer.address);
    console.log("MultiDexAggregator:", await multiDex.getAddress());
    console.log("Supported DEXs:", supportedDexs.join(", "));
    console.log("========================\n");

    // Save deployment addresses to a file
    const deploymentInfo = {
        network: (await ethers.provider.getNetwork()).name,
        deployer: deployer.address,
        contracts: {
            multiDexAggregator: await multiDex.getAddress()
        },
        supportedDexs: supportedDexs,
        timestamp: new Date().toISOString()
    };

    const fs = require('fs');
    fs.writeFileSync(
        'multi-dex-deployment.json',
        JSON.stringify(deploymentInfo, null, 2)
    );

    console.log("Deployment info saved to multi-dex-deployment.json");
    console.log("\nTo use this contract, update your .env file with:");
    console.log(`MULTI_DEX_ADDRESS=${await multiDex.getAddress()}`);

    console.log("\n🎯 Next steps:");
    console.log("1. Update your .env file with the contract address");
    console.log("2. Start the multi-DEX server: yarn dev:multi-dex");
    console.log("3. Test with the client: yarn test:multi-dex");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
