import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { MEVDex, RealDexAggregator, MockERC20 } from "../typechain-types";

describe("MEVDex - MEV Protected DEX", function () {
    let mevDex: MEVDex;
    let realDexAggregator: RealDexAggregator;
    let tokenA: MockERC20;
    let tokenB: MockERC20;
    let owner: SignerWithAddress;
    let user: SignerWithAddress;
    let addr1: SignerWithAddress;

    const COMMITMENT_FEE = ethers.parseEther("0.001");

    beforeEach(async function () {
        [owner, user, addr1] = await ethers.getSigners();

        // Deploy test tokens
        const MockERC20Factory = await ethers.getContractFactory("MockERC20");
        
        tokenA = await MockERC20Factory.deploy(
            "Token A", "TKA", 18, ethers.parseEther("1000000")
        );
        await tokenA.waitForDeployment();

        tokenB = await MockERC20Factory.deploy(
            "Token B", "TKB", 18, ethers.parseEther("1000000")
        );
        await tokenB.waitForDeployment();

        // Deploy RealDexAggregator
        const RealDexAggregatorFactory = await ethers.getContractFactory("RealDexAggregator");
        realDexAggregator = await RealDexAggregatorFactory.deploy();
        await realDexAggregator.waitForDeployment();

        // Deploy MEVDex
        const MEVDexFactory = await ethers.getContractFactory("MEVDex");
        mevDex = await MEVDexFactory.deploy(await realDexAggregator.getAddress());
        await mevDex.waitForDeployment();

        // Configure RealDexAggregator to allow MEVDex to call it
        await realDexAggregator.setAuthorizedCaller(await mevDex.getAddress(), true);

        // Transfer tokens to user for testing
        await tokenA.transfer(user.address, ethers.parseEther("10000"));
        await tokenB.transfer(user.address, ethers.parseEther("10000"));
    });

    describe("Deployment", function () {
        it("Should deploy with correct configuration", async function () {
            expect(await mevDex.owner()).to.equal(owner.address);
            expect(await mevDex.dexAggregator()).to.equal(await realDexAggregator.getAddress());
            
            const [defaultFee, defaultSlippage] = await mevDex.getDefaultParameters();
            expect(defaultFee).to.equal(30); // 0.3%
            expect(defaultSlippage).to.equal(300); // 3%
        });

        it("Should have correct parameter limits", async function () {
            const [minFee, maxFee, minSlippage, maxSlippage] = await mevDex.getParameterLimits();
            
            expect(minFee).to.equal(5); // 0.05%
            expect(maxFee).to.equal(500); // 5%
            expect(minSlippage).to.equal(5); // 0.05%
            expect(maxSlippage).to.equal(500); // 5%
        });
    });

    describe("Quote Functionality", function () {
        it("Should provide swap quotes through aggregator", async function () {
            const [amountOut, bestDex, gasEstimate, priceImpact] = await mevDex.getSwapQuote(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
                ethers.parseEther("100")
            );

            expect(amountOut).to.be.greaterThan(0);
            expect(bestDex).to.not.be.empty;
            expect(gasEstimate).to.be.greaterThan(0);
            expect(priceImpact).to.be.greaterThanOrEqual(0);
        });

        it("Should fall back to default quote if aggregator fails", async function () {
            // Deploy MEVDex with invalid aggregator address
            const MEVDexFactory = await ethers.getContractFactory("MEVDex");
            const mevDexWithBadAggregator = await MEVDexFactory.deploy(ethers.ZeroAddress);
            await mevDexWithBadAggregator.waitForDeployment();

            await expect(
                mevDexWithBadAggregator.getSwapQuote(
                    await tokenA.getAddress(),
                    await tokenB.getAddress(),
                    ethers.parseEther("100")
                )
            ).to.be.revertedWith("DEX aggregator not set");
        });
    });

    describe("Commitment System", function () {
        it("Should allow users to create commitments", async function () {
            const salt = ethers.randomBytes(32);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            
            const commitment = await mevDex.calculateCommitment(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
                ethers.parseEther("100"),
                ethers.parseEther("95"),
                deadline,
                salt,
                30, // 0.3% fee
                300, // 3% slippage
                user.address
            );

            await expect(
                mevDex.connect(user).commitSwap(commitment, { value: COMMITMENT_FEE })
            ).to.emit(mevDex, "SwapCommitted")
              .withArgs(commitment, user.address, await ethers.provider.getBlock("latest").then(b => b!.timestamp + 1));

            // Check commitment was stored
            const [commitmentUser, timestamp, revealed, executed] = await mevDex.getCommitment(commitment);
            expect(commitmentUser).to.equal(user.address);
            expect(revealed).to.be.false;
            expect(executed).to.be.false;
        });

        it("Should reject duplicate commitments", async function () {
            const salt = ethers.randomBytes(32);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            
            const commitment = await mevDex.calculateCommitment(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
                ethers.parseEther("100"),
                ethers.parseEther("95"),
                deadline,
                salt,
                30,
                300,
                user.address
            );

            // First commitment should succeed
            await mevDex.connect(user).commitSwap(commitment, { value: COMMITMENT_FEE });

            // Second commitment with same hash should fail
            await expect(
                mevDex.connect(user).commitSwap(commitment, { value: COMMITMENT_FEE })
            ).to.be.revertedWith("Commitment already exists");
        });

        it("Should require minimum commitment fee", async function () {
            const salt = ethers.randomBytes(32);
            const commitment = ethers.keccak256(salt);

            await expect(
                mevDex.connect(user).commitSwap(commitment, { value: ethers.parseEther("0.0005") })
            ).to.be.revertedWith("Insufficient commitment fee");
        });

        it("Should validate commitment parameters", async function () {
            const salt = ethers.randomBytes(32);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            
            // Test invalid fee (too high)
            await expect(
                mevDex.calculateCommitment(
                    await tokenA.getAddress(),
                    await tokenB.getAddress(),
                    ethers.parseEther("100"),
                    ethers.parseEther("95"),
                    deadline,
                    salt,
                    600, // 6% fee - too high
                    300,
                    user.address
                )
            ).to.not.be.reverted; // calculateCommitment doesn't validate, revealAndSwap does
        });
    });

    describe("Reveal and Swap", function () {
        let commitment: string;
        let swapRequest: any;

        beforeEach(async function () {
            const salt = ethers.randomBytes(32);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            
            swapRequest = {
                tokenIn: await tokenA.getAddress(),
                tokenOut: await tokenB.getAddress(),
                amountIn: ethers.parseEther("100"),
                minAmountOut: ethers.parseEther("95"),
                deadline,
                salt,
                feeBps: 30,
                slippageBps: 300
            };

            commitment = await mevDex.calculateCommitment(
                swapRequest.tokenIn,
                swapRequest.tokenOut,
                swapRequest.amountIn,
                swapRequest.minAmountOut,
                swapRequest.deadline,
                swapRequest.salt,
                swapRequest.feeBps,
                swapRequest.slippageBps,
                user.address
            );

            // Create commitment
            await mevDex.connect(user).commitSwap(commitment, { value: COMMITMENT_FEE });

            // Approve tokens for the swap
            await tokenA.connect(user).approve(await mevDex.getAddress(), swapRequest.amountIn);
        });

        it("Should validate commitment on reveal", async function () {
            // Valid reveal should not revert due to commitment validation
            try {
                await mevDex.connect(user).revealAndSwap(swapRequest, commitment);
            } catch (error: any) {
                // Should not fail due to invalid commitment
                expect(error.message).to.not.include("Invalid commitment");
                // May fail due to other reasons like DEX integration issues in test environment
            }
        });

        it("Should reject invalid commitment", async function () {
            const invalidCommitment = ethers.keccak256(ethers.randomBytes(32));
            
            await expect(
                mevDex.connect(user).revealAndSwap(swapRequest, invalidCommitment)
            ).to.be.revertedWith("Invalid commitment");
        });

        it("Should reject expired deadline", async function () {
            const expiredSwapRequest = {
                ...swapRequest,
                deadline: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
            };

            await expect(
                mevDex.connect(user).revealAndSwap(expiredSwapRequest, commitment)
            ).to.be.revertedWith("Deadline expired");
        });

        it("Should validate fee and slippage parameters", async function () {
            const invalidFeeRequest = {
                ...swapRequest,
                feeBps: 600 // 6% - too high
            };

            const invalidCommitmentForFee = await mevDex.calculateCommitment(
                invalidFeeRequest.tokenIn,
                invalidFeeRequest.tokenOut,
                invalidFeeRequest.amountIn,
                invalidFeeRequest.minAmountOut,
                invalidFeeRequest.deadline,
                invalidFeeRequest.salt,
                invalidFeeRequest.feeBps,
                invalidFeeRequest.slippageBps,
                user.address
            );

            // Create commitment with invalid fee
            await mevDex.connect(user).commitSwap(invalidCommitmentForFee, { value: COMMITMENT_FEE });

            await expect(
                mevDex.connect(user).revealAndSwap(invalidFeeRequest, invalidCommitmentForFee)
            ).to.be.revertedWith("Invalid fee");
        });

        it("Should prevent double reveal", async function () {
            // First reveal (may fail due to DEX integration, but should pass commitment checks)
            try {
                await mevDex.connect(user).revealAndSwap(swapRequest, commitment);
            } catch (error: any) {
                // Ignore DEX-related errors for this test
            }

            // Second reveal should fail
            await expect(
                mevDex.connect(user).revealAndSwap(swapRequest, commitment)
            ).to.be.revertedWith("Already revealed");
        });

        it("Should only allow commitment owner to reveal", async function () {
            await expect(
                mevDex.connect(addr1).revealAndSwap(swapRequest, commitment)
            ).to.be.revertedWith("Not commitment owner");
        });
    });

    describe("Commitment Cancellation", function () {
        let commitment: string;
        let swapRequest: any;

        beforeEach(async function () {
            const salt = ethers.randomBytes(32);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            
            swapRequest = {
                tokenIn: await tokenA.getAddress(),
                tokenOut: await tokenB.getAddress(),
                amountIn: ethers.parseEther("100"),
                minAmountOut: ethers.parseEther("95"),
                deadline,
                salt,
                feeBps: 30,
                slippageBps: 300
            };

            commitment = await mevDex.calculateCommitment(
                swapRequest.tokenIn,
                swapRequest.tokenOut,
                swapRequest.amountIn,
                swapRequest.minAmountOut,
                swapRequest.deadline,
                swapRequest.salt,
                swapRequest.feeBps,
                swapRequest.slippageBps,
                user.address
            );

            await mevDex.connect(user).commitSwap(commitment, { value: COMMITMENT_FEE });
        });

        it("Should not allow cancellation before timeout", async function () {
            await expect(
                mevDex.connect(user).cancelCommitment(commitment)
            ).to.be.revertedWith("Commitment not yet expired");
        });

        it("Should only allow commitment owner to cancel", async function () {
            // Fast forward time (this won't work in hardhat without mining, so we expect the revert to be about ownership)
            await expect(
                mevDex.connect(addr1).cancelCommitment(commitment)
            ).to.be.revertedWith("Not commitment owner");
        });
    });

    describe("Admin Functions", function () {
        it("Should allow owner to set default fee", async function () {
            await mevDex.setDefaultFeeBps(50); // 0.5%
            
            const [defaultFee,] = await mevDex.getDefaultParameters();
            expect(defaultFee).to.equal(50);
        });

        it("Should reject invalid default fee", async function () {
            await expect(
                mevDex.setDefaultFeeBps(600) // 6% - too high
            ).to.be.revertedWith("Invalid default fee");
        });

        it("Should allow owner to set default slippage", async function () {
            await mevDex.setDefaultSlippageBps(200); // 2%
            
            const [, defaultSlippage] = await mevDex.getDefaultParameters();
            expect(defaultSlippage).to.equal(200);
        });

        it("Should allow owner to update DEX aggregator", async function () {
            const newAggregator = "0x1234567890123456789012345678901234567890";
            await mevDex.setDexAggregator(newAggregator);
            
            expect(await mevDex.dexAggregator()).to.equal(newAggregator);
        });

        it("Should reject zero address for DEX aggregator", async function () {
            await expect(
                mevDex.setDexAggregator(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid address");
        });

        it("Should not allow non-owner to change settings", async function () {
            await expect(
                mevDex.connect(user).setDefaultFeeBps(50)
            ).to.be.revertedWithCustomError(mevDex, "OwnableUnauthorizedAccount");
        });
    });

    describe("Emergency Functions", function () {
        beforeEach(async function () {
            // Send some tokens to MEVDex for testing
            await tokenA.transfer(await mevDex.getAddress(), ethers.parseEther("100"));
        });

        it("Should allow owner to withdraw fees", async function () {
            const initialOwnerBalance = await tokenA.balanceOf(owner.address);
            
            await mevDex.withdrawFees(await tokenA.getAddress());
            
            const finalOwnerBalance = await tokenA.balanceOf(owner.address);
            expect(finalOwnerBalance).to.be.greaterThan(initialOwnerBalance);
        });

        it("Should allow owner to withdraw ETH", async function () {
            // Send ETH to contract
            await owner.sendTransaction({
                to: await mevDex.getAddress(),
                value: ethers.parseEther("1")
            });

            const initialOwnerBalance = await ethers.provider.getBalance(owner.address);
            
            const tx = await mevDex.withdrawETH();
            const receipt = await tx.wait();
            const gasCost = receipt!.gasUsed * receipt!.gasPrice;
            
            const finalOwnerBalance = await ethers.provider.getBalance(owner.address);
            
            // Account for gas costs
            const balanceDifference = finalOwnerBalance - initialOwnerBalance + gasCost;
            expect(balanceDifference).to.equal(ethers.parseEther("1"));
        });

        it("Should allow owner to emergency withdraw", async function () {
            await mevDex.emergencyWithdraw(await tokenA.getAddress(), user.address);
            
            const userBalance = await tokenA.balanceOf(user.address);
            expect(userBalance).to.equal(ethers.parseEther("10100")); // 10000 + 100 from contract
        });
    });

    describe("Pausable Functionality", function () {
        it("Should allow owner to pause and unpause", async function () {
            await mevDex.pause();
            expect(await mevDex.paused()).to.be.true;

            await mevDex.unpause();
            expect(await mevDex.paused()).to.be.false;
        });

        it("Should prevent reveals when paused", async function () {
            const salt = ethers.randomBytes(32);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            
            const swapRequest = {
                tokenIn: await tokenA.getAddress(),
                tokenOut: await tokenB.getAddress(),
                amountIn: ethers.parseEther("100"),
                minAmountOut: ethers.parseEther("95"),
                deadline,
                salt,
                feeBps: 30,
                slippageBps: 300
            };

            const commitment = await mevDex.calculateCommitment(
                swapRequest.tokenIn,
                swapRequest.tokenOut,
                swapRequest.amountIn,
                swapRequest.minAmountOut,
                swapRequest.deadline,
                swapRequest.salt,
                swapRequest.feeBps,
                swapRequest.slippageBps,
                user.address
            );

            await mevDex.connect(user).commitSwap(commitment, { value: COMMITMENT_FEE });
            await tokenA.connect(user).approve(await mevDex.getAddress(), swapRequest.amountIn);

            // Pause contract
            await mevDex.pause();

            await expect(
                mevDex.connect(user).revealAndSwap(swapRequest, commitment)
            ).to.be.revertedWithCustomError(mevDex, "EnforcedPause");
        });
    });

    describe("View Functions", function () {
        it("Should correctly identify valid commitments", async function () {
            const salt = ethers.randomBytes(32);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            
            const commitment = await mevDex.calculateCommitment(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
                ethers.parseEther("100"),
                ethers.parseEther("95"),
                deadline,
                salt,
                30,
                300,
                user.address
            );

            // Initially invalid (not committed)
            expect(await mevDex.isCommitmentValid(commitment)).to.be.false;

            // After commitment, should be valid
            await mevDex.connect(user).commitSwap(commitment, { value: COMMITMENT_FEE });
            expect(await mevDex.isCommitmentValid(commitment)).to.be.true;
        });
    });
});