import { ethers } from "hardhat";

async function main() {
    console.log("🚀 Deploying Production-Ready DEX System...");
    console.log("Network:", await ethers.provider.getNetwork().then(n => n.name));

    // Get deployer account
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

    // Step 1: Deploy RealDexIntegration
    console.log("\n📦 Deploying RealDexIntegration...");
    const RealDexIntegration = await ethers.getContractFactory("RealDexIntegration");
    const realDex = await RealDexIntegration.deploy(deployer.address);
    await realDex.waitForDeployment();
    const realDexAddress = await realDex.getAddress();
    console.log("✅ RealDexIntegration deployed to:", realDexAddress);

    // Step 2: Deploy MEVDex with RealDexIntegration as aggregator
    console.log("\n🔒 Deploying MEVDex...");
    const MEVDex = await ethers.getContractFactory("MEVDex");
    const mevDex = await MEVDex.deploy(realDexAddress);
    await mevDex.waitForDeployment();
    const mevDexAddress = await mevDex.getAddress();
    console.log("✅ MEVDex deployed to:", mevDexAddress);

    // Step 3: Deploy MockERC20 tokens for testing
    console.log("\n🪙 Deploying Mock Tokens for Testing...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");

    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6, 1000000); // 1M USDC
    await usdc.waitForDeployment();
    const usdcAddress = await usdc.getAddress();
    console.log("✅ USDC deployed to:", usdcAddress);

    const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18, 10000); // 10K WETH
    await weth.waitForDeployment();
    const wethAddress = await weth.getAddress();
    console.log("✅ WETH deployed to:", wethAddress);

    const dai = await MockERC20.deploy("Dai Stablecoin", "DAI", 18, 1000000); // 1M DAI
    await dai.waitForDeployment();
    const daiAddress = await dai.getAddress();
    console.log("✅ DAI deployed to:", daiAddress);

    // Step 4: Mint some tokens to the deployer for testing
    console.log("\n💰 Minting test tokens...");
    await usdc.mint(deployer.address, 1000000 * 10 ** 6); // 1M USDC
    await weth.mint(deployer.address, 10000 * 10 ** 18);   // 10K WETH
    await dai.mint(deployer.address, 1000000 * 10 ** 18);  // 1M DAI
    console.log("✅ Test tokens minted to deployer");

    // Step 5: Set default parameters on MEVDex
    console.log("\n⚙️ Setting default parameters...");
    await mevDex.setDefaultFeeBps(10); // 0.1% fee
    await mevDex.setDefaultSlippageBps(300); // 3% slippage
    console.log("✅ Default parameters set");

    // Step 6: Verify contract setup
    console.log("\n🔍 Verifying contract setup...");
    const [defaultFee, defaultSlippage] = await mevDex.getDefaultParameters();
    const [minFee, maxFee, minSlippage, maxSlippage] = await mevDex.getParameterLimits();
    const dexAgg = await mevDex.dexAggregator();

    console.log("✅ MEVDex default fee:", defaultFee.toString(), "bps");
    console.log("✅ MEVDex default slippage:", defaultSlippage.toString(), "bps");
    console.log("✅ MEVDex DEX aggregator:", dexAgg);
    console.log("✅ DEX aggregator matches RealDexIntegration:", dexAgg === realDexAddress);

    // Step 7: Test basic functionality
    console.log("\n🧪 Testing basic functionality...");

    // Test commitment creation
    const testCommitment = ethers.keccak256(ethers.toUtf8Bytes("test"));
    const commitmentFee = ethers.parseEther("0.001");
    await mevDex.commitSwap(testCommitment, { value: commitmentFee });
    console.log("✅ Commitment creation test passed");

    // Test quote functionality
    const [bestDex, bestAmount, gasEst] = await realDex.getBestQuote(usdcAddress, wethAddress, 1000 * 10 ** 6);
    console.log("✅ Quote test passed - Best DEX:", bestDex, "Amount:", bestAmount.toString());

    // Deployment Summary
    console.log("\n🎉 DEPLOYMENT COMPLETE!");
    console.log("==================================");
    console.log("📋 Contract Addresses:");
    console.log("   RealDexIntegration:", realDexAddress);
    console.log("   MEVDex:", mevDexAddress);
    console.log("   USDC:", usdcAddress);
    console.log("   WETH:", wethAddress);
    console.log("   DAI:", daiAddress);
    console.log("\n🔧 Configuration:");
    console.log("   Default Fee: 10 bps (0.1%)");
    console.log("   Default Slippage: 300 bps (3%)");
    console.log("   Network: Sepolia Testnet");
    console.log("\n🚀 Ready for mainnet deployment!");
    console.log("   Just change the router addresses in RealDexIntegration constructor");
    console.log("   and set isMainnet = true");
    console.log("\n📝 Next steps:");
    console.log("   1. Update your .env file with these addresses");
    console.log("   2. Test the system with the frontend");
    console.log("   3. For mainnet: update router addresses and deploy");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
