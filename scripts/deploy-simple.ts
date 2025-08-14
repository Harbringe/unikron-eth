import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
    console.log("🚀 Deploying Simplified Multi-DEX System...");

    // Get the deployer account
    const [deployer] = await ethers.getSigners();
    console.log("📝 Deploying contracts with account:", deployer.address);
    console.log("💰 Account balance:", (await deployer.provider?.getBalance(deployer.address))?.toString());

    // Deploy MockERC20 tokens
    console.log("\n🏗️ Deploying Mock Tokens...");

    const MockERC20 = await ethers.getContractFactory("MockERC20");

    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6, 10000);
    await usdc.waitForDeployment();
    console.log("✅ USDC deployed to:", await usdc.getAddress());

    const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18, 100);
    await weth.waitForDeployment();
    console.log("✅ WETH deployed to:", await weth.getAddress());

    const dai = await MockERC20.deploy("Dai Stablecoin", "DAI", 18, 10000);
    await dai.waitForDeployment();
    console.log("✅ DAI deployed to:", await dai.getAddress());

    // Deploy MEVDex contract
    console.log("\n🏗️ Deploying MEV DEX Contract...");
    const MEVDex = await ethers.getContractFactory("MEVDex");
    const mevDex = await MEVDex.deploy(ethers.ZeroAddress); // Pass zero address as placeholder
    await mevDex.waitForDeployment();
    console.log("✅ MEVDex deployed to:", await mevDex.getAddress());

    // Deploy WorkingMultiDex contract
    console.log("\n🏗️ Deploying Working Multi-DEX Contract...");
    const WorkingMultiDex = await ethers.getContractFactory("WorkingMultiDex");
    const workingMultiDex = await WorkingMultiDex.deploy();
    await workingMultiDex.waitForDeployment();
    console.log("✅ WorkingMultiDex deployed to:", await workingMultiDex.getAddress());

    // Note: Tokens are already minted in constructor
    console.log("\n💰 Initial token supply (minted in constructor):");
    console.log("✅ USDC: 10,000 tokens (6 decimals)");
    console.log("✅ WETH: 100 tokens (18 decimals)");
    console.log("✅ DAI: 10,000 tokens (18 decimals)");

    // Test the WorkingMultiDex contract
    console.log("\n🧪 Testing WorkingMultiDex contract...");

    try {
        const supportedDexs = await workingMultiDex.getSupportedDexs();
        console.log("✅ Supported DEXs:", supportedDexs);

        // Test quote simulation
        const testAmount = ethers.parseUnits("1000", 6); // 1000 USDC
        const quotes = await workingMultiDex.getAllQuotes(
            await usdc.getAddress(),
            await weth.getAddress(),
            testAmount
        );

        console.log("✅ Quote simulation successful");
        console.log("📊 Number of quotes:", quotes.length);

        if (quotes.length > 0) {
            console.log("🏆 Best quote:", quotes[0].dexName);
            console.log("💰 Amount out:", ethers.formatUnits(quotes[0].amountOut, 6));
        }

        const bestQuote = await workingMultiDex.getBestQuote(
            await usdc.getAddress(),
            await weth.getAddress(),
            testAmount
        );
        console.log("✅ Best quote retrieval successful");
        console.log("🏆 Best DEX:", bestQuote.dexName);

    } catch (error) {
        console.log("⚠️ Contract test failed:", error);
    }

    // Save deployment info
    const deploymentInfo = {
        network: "sepolia",
        timestamp: new Date().toISOString(),
        deployer: deployer.address,
        contracts: {
            usdc: await usdc.getAddress(),
            weth: await weth.getAddress(),
            dai: await dai.getAddress(),
            mevDex: await mevDex.getAddress(),
            workingMultiDex: await workingMultiDex.getAddress()
        },
        tokens: {
            usdc: {
                address: await usdc.getAddress(),
                symbol: "USDC",
                decimals: 6,
                initialSupply: ethers.formatUnits(10000, 6) // 10,000 USDC
            },
            weth: {
                address: await weth.getAddress(),
                symbol: "WETH",
                decimals: 18,
                initialSupply: ethers.formatUnits(100, 18) // 100 WETH
            },
            dai: {
                address: await dai.getAddress(),
                symbol: "DAI",
                decimals: 18,
                initialSupply: ethers.formatUnits(10000, 18) // 10,000 DAI
            }
        }
    };

    // Write deployment info to file
    fs.writeFileSync(
        "deployment-working.json",
        JSON.stringify(deploymentInfo, null, 2)
    );

    console.log("\n📁 Deployment info saved to deployment-working.json");
    console.log("\n🎉 Deployment completed successfully!");
    console.log("\n📋 Next steps:");
    console.log("1. Update your .env file with the contract addresses");
    console.log("2. Start the enhanced server: yarn dev:enhanced");
    console.log("3. Test the system: yarn test:enhanced");
    console.log("\n🔗 Contract Addresses:");
    console.log("USDC:", await usdc.getAddress());
    console.log("WETH:", await weth.getAddress());
    console.log("DAI:", await dai.getAddress());
    console.log("MEVDex:", await mevDex.getAddress());
    console.log("WorkingMultiDex:", await workingMultiDex.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
