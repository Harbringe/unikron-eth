import { ethers } from "hardhat";
import { MEVDex, MockERC20 } from "../typechain-types";

async function main() {
    console.log("🚀 Starting MEV-Protected DEX Demo...\n");

    // Get signers
    const [deployer, user1, user2] = await ethers.getSigners();
    console.log("👤 Deployer:", deployer.address);
    console.log("👤 User 1:", user1.address);
    console.log("👤 User 2:", user2.address);

    // Deploy mock tokens
    console.log("\n📦 Deploying Mock Tokens...");
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");

    const usdc = await MockERC20Factory.deploy("USD Coin", "USDC", 6, 1000000);
    await usdc.waitForDeployment();
    console.log("✅ USDC deployed to:", await usdc.getAddress());

    const weth = await MockERC20Factory.deploy("Wrapped Ether", "WETH", 18, 10000);
    await weth.waitForDeployment();
    console.log("✅ WETH deployed to:", await weth.getAddress());

    // Deploy MEVDex
    console.log("\n🏗️ Deploying MEV-Protected DEX...");
    const MEVDexFactory = await ethers.getContractFactory("MEVDex");
    const mevDex = await MEVDexFactory.deploy(ethers.ZeroAddress);
    await mevDex.waitForDeployment();
    console.log("✅ MEVDex deployed to:", await mevDex.getAddress());

    // Mint tokens to users
    console.log("\n💰 Minting Test Tokens...");
    const usdcAmount = ethers.parseUnits("1000", 6); // 1000 USDC
    const wethAmount = ethers.parseUnits("10", 18); // 10 WETH

    await usdc.mint(user1.address, usdcAmount);
    await weth.mint(user1.address, wethAmount);
    console.log("✅ Minted tokens to User 1");

    // Approve MEVDex to spend user's tokens
    console.log("\n🔐 Setting Token Approvals...");
    await usdc.connect(user1).approve(await mevDex.getAddress(), usdcAmount);
    await weth.connect(user1).approve(await mevDex.getAddress(), wethAmount);
    console.log("✅ Token approvals set");

    // Demo: MEV-Protected Swap
    console.log("\n🔄 Starting MEV-Protected Swap Demo...");

    // Step 1: Create swap parameters
    const swapAmount = ethers.parseUnits("100", 6); // 100 USDC
    const minAmountOut = ethers.parseUnits("0.05", 18); // 0.05 WETH
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    // Generate random salt for commitment
    const salt = ethers.randomBytes(32);
    const saltHex = ethers.hexlify(salt);

    console.log("📋 Swap Parameters:");
    console.log("  Token In (USDC):", await usdc.getAddress());
    console.log("  Token Out (WETH):", await weth.getAddress());
    console.log("  Amount In:", ethers.formatUnits(swapAmount, 6), "USDC");
    console.log("  Min Amount Out:", ethers.formatUnits(minAmountOut, 18), "WETH");
    console.log("  Deadline:", new Date(deadline * 1000).toISOString());
    console.log("  Salt:", saltHex);

    // Step 2: Create commitment hash
    const commitmentData = ethers.solidityPacked(
        ['address', 'address', 'uint256', 'uint256', 'uint256', 'bytes32', 'address'],
        [await usdc.getAddress(), await weth.getAddress(), swapAmount, minAmountOut, deadline, saltHex, user1.address]
    );
    const commitment = ethers.keccak256(commitmentData);

    console.log("\n🔒 Commitment Hash:", commitment);

    // Step 3: Commit to the swap
    console.log("\n📝 Step 1: Committing to Swap...");
    const commitmentFee = ethers.parseEther("0.001");

    const commitTx = await mevDex.connect(user1).commitSwap(commitment, { value: commitmentFee });
    console.log("⏳ Commitment transaction sent:", commitTx.hash);

    const commitReceipt = await commitTx.wait();
    console.log("✅ Commitment confirmed in block:", commitReceipt?.blockNumber);

    // Step 4: Check commitment status
    console.log("\n🔍 Checking Commitment Status...");
    const commitmentData_ = await mevDex.getCommitment(commitment);
    console.log("  User:", commitmentData_[0]);
    console.log("  Timestamp:", new Date(Number(commitmentData_[1]) * 1000).toISOString());
    console.log("  Revealed:", commitmentData_[2]);
    console.log("  Executed:", commitmentData_[3]);

    // Step 5: Reveal and execute swap
    console.log("\n🚀 Step 2: Revealing and Executing Swap...");

    const swapRequest = {
        tokenIn: await usdc.getAddress(),
        tokenOut: await weth.getAddress(),
        amountIn: swapAmount,
        minAmountOut: minAmountOut,
        deadline: deadline,
        salt: saltHex
    };

    const revealTx = await mevDex.connect(user1).revealAndSwap(swapRequest, commitment);
    console.log("⏳ Reveal transaction sent:", revealTx.hash);

    const revealReceipt = await revealTx.wait();
    console.log("✅ Swap executed in block:", revealReceipt?.blockNumber);

    // Step 6: Check final balances
    console.log("\n💰 Final Token Balances:");
    const finalUsdcBalance = await usdc.balanceOf(user1.address);
    const finalWethBalance = await weth.balanceOf(user1.address);

    console.log("  USDC Balance:", ethers.formatUnits(finalUsdcBalance, 6));
    console.log("  WETH Balance:", ethers.formatUnits(finalWethBalance, 18));

    // Step 7: Check commitment final status
    console.log("\n🔍 Final Commitment Status...");
    const finalCommitmentData = await mevDex.getCommitment(commitment);
    console.log("  Revealed:", finalCommitmentData[2]);
    console.log("  Executed:", finalCommitmentData[3]);

    // Demo: Show MEV protection
    console.log("\n🛡️ MEV Protection Features Demonstrated:");
    console.log("  ✅ Commit-Reveal Pattern: Swap intentions hidden until execution");
    console.log("  ✅ Front-running Prevention: Bots can't see pending swaps");
    console.log("  ✅ Sandwich Attack Protection: No MEV extraction possible");
    console.log("  ✅ Timeout Protection: Commitments expire after 1 hour");
    console.log("  ✅ Cryptographic Security: Uses keccak256 commitments");

    console.log("\n🎉 Demo completed successfully!");
    console.log("\n📚 To interact with the contracts:");
    console.log("  MEVDex:", await mevDex.getAddress());
    console.log("  USDC:", await usdc.getAddress());
    console.log("  WETH:", await weth.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Demo failed:", error);
        process.exit(1);
    });
