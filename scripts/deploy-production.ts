import { ethers } from "hardhat";

async function main() {
    console.log("🚀 Deploying Production DEX Aggregation System...");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

    // 1. Deploy MockERC20 tokens for testing
    console.log("\n📋 Deploying Test Tokens...");
    
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    
    const tokenA = await MockERC20.deploy(
        "Test Token A", 
        "TTA", 
        18, 
        ethers.parseEther("1000000") // 1M tokens
    );
    await tokenA.waitForDeployment();
    console.log("TokenA (TTA) deployed to:", await tokenA.getAddress());

    const tokenB = await MockERC20.deploy(
        "Test Token B", 
        "TTB", 
        18, 
        ethers.parseEther("1000000") // 1M tokens
    );
    await tokenB.waitForDeployment();
    console.log("TokenB (TTB) deployed to:", await tokenB.getAddress());

    const tokenC = await MockERC20.deploy(
        "Test Token C", 
        "TTC", 
        6, // 6 decimals like USDC
        1000000 * 10**6 // 1M tokens with 6 decimals
    );
    await tokenC.waitForDeployment();
    console.log("TokenC (TTC) deployed to:", await tokenC.getAddress());

    // 2. Deploy RealDexAggregator
    console.log("\n🔄 Deploying Real DEX Aggregator...");
    
    const RealDexAggregator = await ethers.getContractFactory("RealDexAggregator");
    const realDexAggregator = await RealDexAggregator.deploy();
    await realDexAggregator.waitForDeployment();
    const realDexAddress = await realDexAggregator.getAddress();
    console.log("RealDexAggregator deployed to:", realDexAddress);

    // 3. Deploy WorkingMultiDex (updated interface)
    console.log("\n🔗 Deploying Multi-DEX Interface...");
    
    const WorkingMultiDex = await ethers.getContractFactory("WorkingMultiDex");
    const workingMultiDex = await WorkingMultiDex.deploy(realDexAddress);
    await workingMultiDex.waitForDeployment();
    const multiDexAddress = await workingMultiDex.getAddress();
    console.log("WorkingMultiDex deployed to:", multiDexAddress);

    // 4. Deploy MEVDex with real aggregator
    console.log("\n🛡️  Deploying MEV-Protected DEX...");
    
    const MEVDex = await ethers.getContractFactory("MEVDex");
    const mevDex = await MEVDex.deploy(realDexAddress);
    await mevDex.waitForDeployment();
    const mevDexAddress = await mevDex.getAddress();
    console.log("MEVDex deployed to:", mevDexAddress);

    // 5. Deploy 1inch Integration
    console.log("\n🔀 Deploying 1inch Integration...");
    
    const OneInchIntegration = await ethers.getContractFactory("OneInchIntegration");
    const oneInchIntegration = await OneInchIntegration.deploy();
    await oneInchIntegration.waitForDeployment();
    const oneInchAddress = await oneInchIntegration.getAddress();
    console.log("OneInchIntegration deployed to:", oneInchAddress);

    // 6. Configure contracts
    console.log("\n⚙️  Configuring Contracts...");
    
    // Set DEX aggregator in MEV contract
    await mevDex.setDexAggregator(realDexAddress);
    console.log("✅ MEVDex configured with RealDexAggregator");

    // Authorize MEVDex to call RealDexAggregator
    await realDexAggregator.setAuthorizedCaller(mevDexAddress, true);
    console.log("✅ MEVDex authorized to call RealDexAggregator");
    
    // Enable MEV protection for MEVDex contract
    await realDexAggregator.setMevProtectedContract(mevDexAddress, true);
    console.log("✅ MEV protection enabled for MEVDex contract");

    // Test contract functions
    console.log("\n🧪 Testing Contract Functions...");
    
    try {
        // Test MEVDex parameters
        const [defaultFee, defaultSlippage] = await mevDex.getDefaultParameters();
        console.log(`✅ MEVDex default fee: ${defaultFee} bps, slippage: ${defaultSlippage} bps`);

        // Test supported DEXs
        const supportedDexs = await workingMultiDex.getSupportedDexs();
        console.log(`✅ Supported DEXs: ${supportedDexs.join(', ')}`);

        // Test 1inch router availability
        const routerAvailable = await oneInchIntegration.isRouterAvailable();
        console.log(`✅ 1inch router available: ${routerAvailable}`);

    } catch (error) {
        console.log("⚠️  Some contract functions failed during testing:", error);
    }

    // 7. Create environment configuration
    console.log("\n📝 Contract Deployment Summary:");
    console.log("================================");
    console.log(`Network: ${(await deployer.provider.getNetwork()).name}`);
    console.log(`Chain ID: ${(await deployer.provider.getNetwork()).chainId}`);
    console.log(`Deployer: ${deployer.address}`);
    console.log("");
    console.log("📋 Test Tokens:");
    console.log(`TOKEN_A_ADDRESS=${await tokenA.getAddress()}`);
    console.log(`TOKEN_B_ADDRESS=${await tokenB.getAddress()}`);
    console.log(`TOKEN_C_ADDRESS=${await tokenC.getAddress()}`);
    console.log("");
    console.log("🔗 Core Contracts:");
    console.log(`REAL_DEX_AGGREGATOR_ADDRESS=${realDexAddress}`);
    console.log(`MULTI_DEX_ADDRESS=${multiDexAddress}`);
    console.log(`MEV_DEX_ADDRESS=${mevDexAddress}`);
    console.log(`ONEINCH_INTEGRATION_ADDRESS=${oneInchAddress}`);
    console.log("");
    console.log("🌍 Environment Variables for .env:");
    console.log(`CONTRACT_ADDRESS=${mevDexAddress}`);
    console.log(`MULTI_DEX_ADDRESS=${multiDexAddress}`);
    console.log(`REAL_DEX_AGGREGATOR_ADDRESS=${realDexAddress}`);
    console.log("");
    console.log("✅ Deployment Complete!");
    console.log("");
    console.log("🔧 Next Steps:");
    console.log("1. Update your .env file with the contract addresses above");
    console.log("2. Test the system with the provided test tokens");
    console.log("3. Configure the server to use the new contracts");
    console.log("4. For mainnet: Update DEX router addresses in RealDexAggregator");
    
    // Return deployment info
    return {
        tokenA: await tokenA.getAddress(),
        tokenB: await tokenB.getAddress(), 
        tokenC: await tokenC.getAddress(),
        realDexAggregator: realDexAddress,
        workingMultiDex: multiDexAddress,
        mevDex: mevDexAddress,
        oneInchIntegration: oneInchAddress,
        deployer: deployer.address,
        network: await deployer.provider.getNetwork()
    };
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then((deploymentInfo) => {
        console.log("\n🎉 Deployment successful!");
        console.log("Deployment info:", JSON.stringify(deploymentInfo, null, 2));
    })
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exitCode = 1;
    });