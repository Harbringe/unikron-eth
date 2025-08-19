import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { RealDexAggregator, MockERC20 } from "../typechain-types";

describe("RealDexAggregator", function () {
    let realDexAggregator: RealDexAggregator;
    let tokenA: MockERC20;
    let tokenB: MockERC20;
    let owner: SignerWithAddress;
    let user: SignerWithAddress;
    let addr1: SignerWithAddress;

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

        // Transfer tokens to user for testing
        await tokenA.transfer(user.address, ethers.parseEther("10000"));
        await tokenB.transfer(user.address, ethers.parseEther("10000"));
    });

    describe("Deployment", function () {
        it("Should deploy with correct initial configuration", async function () {
            expect(await realDexAggregator.owner()).to.equal(owner.address);
            
            // Check if DEX configs are initialized
            const uniswapV2Config = await realDexAggregator.dexConfigs(0); // UNISWAP_V2
            expect(uniswapV2Config.isActive).to.be.true;
            expect(uniswapV2Config.router).to.equal("0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D");
        });

        it("Should set owner as authorized caller", async function () {
            expect(await realDexAggregator.authorizedCallers(owner.address)).to.be.true;
        });
    });

    describe("Quote Generation", function () {
        it("Should generate quotes from all active DEXs", async function () {
            const quotes = await realDexAggregator.getAllQuotes(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
                ethers.parseEther("100")
            );

            expect(quotes.length).to.be.greaterThan(0);
            
            // Check that at least some quotes are active
            const activeQuotes = quotes.filter(quote => quote.isActive);
            expect(activeQuotes.length).to.be.greaterThan(0);
        });

        it("Should return best quote", async function () {
            const bestQuote = await realDexAggregator.getBestQuote(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
                ethers.parseEther("100")
            );

            expect(bestQuote.amountOut).to.be.greaterThan(0);
            expect(bestQuote.dexName).to.not.be.empty;
            expect(bestQuote.isActive).to.be.true;
        });

        it("Should handle zero amount input", async function () {
            await expect(
                realDexAggregator.getAllQuotes(
                    await tokenA.getAddress(),
                    await tokenB.getAddress(),
                    0
                )
            ).to.be.revertedWith("Invalid amount");
        });

        it("Should handle same token input/output", async function () {
            await expect(
                realDexAggregator.getAllQuotes(
                    await tokenA.getAddress(),
                    await tokenA.getAddress(),
                    ethers.parseEther("100")
                )
            ).to.be.revertedWith("Same token");
        });
    });

    describe("DEX Configuration", function () {
        it("Should allow owner to update DEX configuration", async function () {
            const newRouter = "0x1234567890123456789012345678901234567890";
            
            await realDexAggregator.updateDexConfig(
                0, // UNISWAP_V2
                newRouter,
                false, // disable
                200000, // gas estimate
                800 // reliability
            );

            const updatedConfig = await realDexAggregator.dexConfigs(0);
            expect(updatedConfig.router).to.equal(newRouter);
            expect(updatedConfig.isActive).to.be.false;
            expect(updatedConfig.gasEstimate).to.equal(200000);
            expect(updatedConfig.reliability).to.equal(800);
        });

        it("Should not allow non-owner to update DEX configuration", async function () {
            await expect(
                realDexAggregator.connect(user).updateDexConfig(
                    0, // UNISWAP_V2
                    "0x1234567890123456789012345678901234567890",
                    false,
                    200000,
                    800
                )
            ).to.be.revertedWithCustomError(realDexAggregator, "OwnableUnauthorizedAccount");
        });

        it("Should allow owner to set authorized callers", async function () {
            await realDexAggregator.setAuthorizedCaller(user.address, true);
            expect(await realDexAggregator.authorizedCallers(user.address)).to.be.true;

            await realDexAggregator.setAuthorizedCaller(user.address, false);
            expect(await realDexAggregator.authorizedCallers(user.address)).to.be.false;
        });
    });

    describe("Emergency Functions", function () {
        beforeEach(async function () {
            // Send some tokens to the contract for testing emergency withdraw
            await tokenA.transfer(await realDexAggregator.getAddress(), ethers.parseEther("100"));
        });

        it("Should allow owner to emergency withdraw tokens", async function () {
            const contractAddress = await realDexAggregator.getAddress();
            const initialBalance = await tokenA.balanceOf(contractAddress);
            expect(initialBalance).to.equal(ethers.parseEther("100"));

            await realDexAggregator.emergencyWithdraw(
                await tokenA.getAddress(),
                owner.address,
                ethers.parseEther("50")
            );

            const finalBalance = await tokenA.balanceOf(contractAddress);
            expect(finalBalance).to.equal(ethers.parseEther("50"));
        });

        it("Should not allow non-owner to emergency withdraw", async function () {
            await expect(
                realDexAggregator.connect(user).emergencyWithdraw(
                    await tokenA.getAddress(),
                    user.address,
                    ethers.parseEther("50")
                )
            ).to.be.revertedWithCustomError(realDexAggregator, "OwnableUnauthorizedAccount");
        });
    });

    describe("Pausable Functionality", function () {
        it("Should allow owner to pause and unpause", async function () {
            // Initially not paused
            expect(await realDexAggregator.paused()).to.be.false;

            // Pause
            await realDexAggregator.pause();
            expect(await realDexAggregator.paused()).to.be.true;

            // Unpause
            await realDexAggregator.unpause();
            expect(await realDexAggregator.paused()).to.be.false;
        });

        it("Should prevent swaps when paused", async function () {
            // First authorize user to call executeSwap
            await realDexAggregator.setAuthorizedCaller(user.address, true);
            
            // Approve tokens
            await tokenA.connect(user).approve(await realDexAggregator.getAddress(), ethers.parseEther("100"));

            // Pause the contract
            await realDexAggregator.pause();

            // Try to execute swap - should fail
            const swapParams = {
                tokenIn: await tokenA.getAddress(),
                tokenOut: await tokenB.getAddress(),
                amountIn: ethers.parseEther("100"),
                minAmountOut: ethers.parseEther("90"),
                recipient: user.address,
                deadline: Math.floor(Date.now() / 1000) + 3600,
                preferredDex: 0, // UNISWAP_V2
                useMultiHop: false
            };

            await expect(
                realDexAggregator.connect(user).executeSwap(swapParams)
            ).to.be.revertedWithCustomError(realDexAggregator, "EnforcedPause");
        });
    });

    describe("Access Control", function () {
        it("Should require authorization to call executeSwap", async function () {
            const swapParams = {
                tokenIn: await tokenA.getAddress(),
                tokenOut: await tokenB.getAddress(),
                amountIn: ethers.parseEther("100"),
                minAmountOut: ethers.parseEther("90"),
                recipient: user.address,
                deadline: Math.floor(Date.now() / 1000) + 3600,
                preferredDex: 0, // UNISWAP_V2
                useMultiHop: false
            };

            await expect(
                realDexAggregator.connect(user).executeSwap(swapParams)
            ).to.be.revertedWith("Not authorized");
        });

        it("Should allow authorized callers to execute swaps", async function () {
            // Authorize user
            await realDexAggregator.setAuthorizedCaller(user.address, true);
            
            // Approve tokens
            await tokenA.connect(user).approve(await realDexAggregator.getAddress(), ethers.parseEther("100"));

            const swapParams = {
                tokenIn: await tokenA.getAddress(),
                tokenOut: await tokenB.getAddress(),
                amountIn: ethers.parseEther("100"),
                minAmountOut: ethers.parseEther("90"),
                recipient: user.address,
                deadline: Math.floor(Date.now() / 1000) + 3600,
                preferredDex: 0, // UNISWAP_V2
                useMultiHop: false
            };

            // This should not revert due to authorization, but may revert due to DEX not being available
            // In test environment, we expect it to revert with DEX-related errors, not authorization errors
            try {
                await realDexAggregator.connect(user).executeSwap(swapParams);
            } catch (error: any) {
                // Should not be authorization error
                expect(error.message).to.not.include("Not authorized");
            }
        });
    });

    describe("Quote Scoring Algorithm", function () {
        it("Should score quotes based on amount, reliability and gas cost", async function () {
            const quotes = await realDexAggregator.getAllQuotes(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
                ethers.parseEther("1000") // Larger amount for better testing
            );

            const bestQuote = await realDexAggregator.getBestQuote(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
                ethers.parseEther("1000")
            );

            // Best quote should be among the returned quotes
            const matchingQuote = quotes.find(q => 
                q.dexName === bestQuote.dexName && 
                q.amountOut === bestQuote.amountOut
            );
            
            expect(matchingQuote).to.not.be.undefined;
        });
    });

    describe("Error Handling", function () {
        it("Should handle invalid token addresses gracefully", async function () {
            // Test with zero address
            await expect(
                realDexAggregator.getAllQuotes(
                    ethers.ZeroAddress,
                    await tokenB.getAddress(),
                    ethers.parseEther("100")
                )
            ).to.not.be.reverted; // Should return empty or failed quotes, not revert

            const quotes = await realDexAggregator.getAllQuotes(
                ethers.ZeroAddress,
                await tokenB.getAddress(),
                ethers.parseEther("100")
            );
            
            // All quotes should be inactive due to invalid token
            const activeQuotes = quotes.filter(q => q.isActive);
            expect(activeQuotes.length).to.equal(0);
        });
    });
});