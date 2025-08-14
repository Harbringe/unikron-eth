import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, ContractFactory, Signer } from "ethers";
import { MockERC20, MEVDex } from "../typechain-types";

describe("MEVDex", function () {
    let mevDex: MEVDex;
    let usdc: MockERC20;
    let weth: MockERC20;
    let dai: MockERC20;
    let owner: Signer;
    let user1: Signer;
    let user2: Signer;
    let ownerAddress: string;
    let user1Address: string;
    let user2Address: string;

    beforeEach(async function () {
        // Get signers
        [owner, user1, user2] = await ethers.getSigners();
        ownerAddress = await owner.getAddress();
        user1Address = await user1.getAddress();
        user2Address = await user2.getAddress();

        // Deploy mock tokens
        const MockERC20Factory: ContractFactory = await ethers.getContractFactory("MockERC20");
        usdc = await MockERC20Factory.deploy("USD Coin", "USDC", 6, 1000000);
        weth = await MockERC20Factory.deploy("Wrapped Ether", "WETH", 18, 10000);
        dai = await MockERC20Factory.deploy("Dai Stablecoin", "DAI", 18, 1000000);

        // Deploy MEVDex
        const MEVDexFactory: ContractFactory = await ethers.getContractFactory("MEVDex");
        mevDex = await MEVDexFactory.deploy(ethers.ZeroAddress);

        // Mint tokens to users for testing
        const usdcAmount = ethers.parseUnits("1000", 6);
        const wethAmount = ethers.parseUnits("10", 18);
        const daiAmount = ethers.parseUnits("1000", 18);

        await usdc.mint(user1Address, usdcAmount);
        await weth.mint(user1Address, wethAmount);
        await dai.mint(user1Address, daiAmount);

        // Approve MEVDex to spend user's tokens
        await usdc.connect(user1).approve(await mevDex.getAddress(), usdcAmount);
        await weth.connect(user1).approve(await mevDex.getAddress(), wethAmount);
        await dai.connect(user1).approve(await mevDex.getAddress(), daiAmount);
    });

    describe("Deployment", function () {
        it("Should deploy with correct initial values", async function () {
            expect(await mevDex.owner()).to.equal(ownerAddress);
            expect(await mevDex.feeBps()).to.equal(30); // 0.3%
            expect(await mevDex.dexAggregator()).to.equal(ethers.ZeroAddress);
        });
    });

    describe("Commit Swap", function () {
        it("Should commit a swap successfully", async function () {
            const commitment = ethers.utils.keccak256(ethers.utils.randomBytes(32));
            const commitmentFee = ethers.utils.parseEther("0.001");

            await expect(mevDex.connect(user1).commitSwap(commitment, { value: commitmentFee }))
                .to.emit(mevDex, "SwapCommitted")
                .withArgs(commitment, user1Address, await time());

            const commitmentData = await mevDex.getCommitment(commitment);
            expect(commitmentData.user).to.equal(user1Address);
            expect(commitmentData.revealed).to.be.false;
            expect(commitmentData.executed).to.be.false;
        });

        it("Should fail with insufficient commitment fee", async function () {
            const commitment = ethers.utils.keccak256(ethers.utils.randomBytes(32));
            const insufficientFee = ethers.utils.parseEther("0.0005");

            await expect(
                mevDex.connect(user1).commitSwap(commitment, { value: insufficientFee })
            ).to.be.revertedWith("Insufficient commitment fee");
        });

        it("Should fail if commitment already exists", async function () {
            const commitment = ethers.utils.keccak256(ethers.utils.randomBytes(32));
            const commitmentFee = ethers.utils.parseEther("0.001");

            await mevDex.connect(user1).commitSwap(commitment, { value: commitmentFee });

            await expect(
                mevDex.connect(user2).commitSwap(commitment, { value: commitmentFee })
            ).to.be.revertedWith("Commitment already exists");
        });
    });

    describe("Reveal and Swap", function () {
        let commitment: string;
        let swapRequest: any;
        let salt: string;

        beforeEach(async function () {
            salt = ethers.utils.keccak256(ethers.utils.randomBytes(32));
            const deadline = (await time()) + 3600; // 1 hour from now

            swapRequest = {
                tokenIn: usdc.address,
                tokenOut: weth.address,
                amountIn: ethers.utils.parseUnits("100", 6), // 100 USDC
                minAmountOut: ethers.utils.parseUnits("0.05", 18), // 0.05 WETH
                deadline: deadline,
                salt: salt
            };

            // Create commitment hash
            const commitmentData = ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256", "uint256", "uint256", "bytes32", "address"],
                [swapRequest.tokenIn, swapRequest.tokenOut, swapRequest.amountIn, swapRequest.minAmountOut, swapRequest.deadline, swapRequest.salt, user1Address]
            );
            commitment = ethers.utils.keccak256(commitmentData);

            // Commit first
            const commitmentFee = ethers.utils.parseEther("0.001");
            await mevDex.connect(user1).commitSwap(commitment, { value: commitmentFee });
        });

        it("Should reveal and execute swap successfully", async function () {
            const user1BalanceBefore = await usdc.balanceOf(user1Address);
            const user1WethBalanceBefore = await weth.balanceOf(user1Address);

            await expect(mevDex.connect(user1).revealAndSwap(swapRequest, commitment))
                .to.emit(mevDex, "SwapRevealed")
                .and.to.emit(mevDex, "SwapExecuted");

            const commitmentData = await mevDex.getCommitment(commitment);
            expect(commitmentData.revealed).to.be.true;
            expect(commitmentData.executed).to.be.true;

            // Check token balances
            const user1BalanceAfter = await usdc.balanceOf(user1Address);
            const user1WethBalanceAfter = await weth.balanceOf(user1Address);

            expect(user1BalanceAfter).to.be.lt(user1BalanceBefore);
            expect(user1WethBalanceAfter).to.be.gt(user1WethBalanceBefore);
        });

        it("Should fail if commitment doesn't match", async function () {
            const wrongCommitment = ethers.utils.keccak256(ethers.utils.randomBytes(32));

            await expect(
                mevDex.connect(user1).revealAndSwap(swapRequest, wrongCommitment)
            ).to.be.revertedWith("Invalid commitment");
        });

        it("Should fail if not commitment owner", async function () {
            await expect(
                mevDex.connect(user2).revealAndSwap(swapRequest, commitment)
            ).to.be.revertedWith("Not commitment owner");
        });

        it("Should fail if deadline expired", async function () {
            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [3601]);
            await ethers.provider.send("evm_mine", []);

            await expect(
                mevDex.connect(user1).revealAndSwap(swapRequest, commitment)
            ).to.be.revertedWith("Deadline expired");
        });

        it("Should fail if already revealed", async function () {
            await mevDex.connect(user1).revealAndSwap(swapRequest, commitment);

            await expect(
                mevDex.connect(user1).revealAndSwap(swapRequest, commitment)
            ).to.be.revertedWith("Already revealed");
        });
    });

    describe("Cancel Commitment", function () {
        it("Should cancel commitment after timeout", async function () {
            const commitment = ethers.utils.keccak256(ethers.utils.randomBytes(32));
            const commitmentFee = ethers.utils.parseEther("0.001");

            await mevDex.connect(user1).commitSwap(commitment, { value: commitmentFee });

            // Fast forward time past timeout
            await ethers.provider.send("evm_increaseTime", [3601]);
            await ethers.provider.send("evm_mine", []);

            const user1BalanceBefore = await ethers.provider.getBalance(user1Address);

            await mevDex.connect(user1).cancelCommitment(commitment);

            const user1BalanceAfter = await ethers.provider.getBalance(user1Address);
            expect(user1BalanceAfter).to.be.gt(user1BalanceBefore);

            // Check commitment is deleted
            const commitmentData = await mevDex.getCommitment(commitment);
            expect(commitmentData.user).to.equal(ethers.constants.AddressZero);
        });

        it("Should fail to cancel before timeout", async function () {
            const commitment = ethers.utils.keccak256(ethers.utils.randomBytes(32));
            const commitmentFee = ethers.utils.parseEther("0.001");

            await mevDex.connect(user1).commitSwap(commitment, { value: commitmentFee });

            await expect(
                mevDex.connect(user1).cancelCommitment(commitment)
            ).to.be.revertedWith("Commitment not yet expired");
        });
    });

    describe("Admin Functions", function () {
        it("Should allow owner to set fee", async function () {
            await mevDex.connect(owner).setFeeBps(50); // 0.5%
            expect(await mevDex.feeBps()).to.equal(50);
        });

        it("Should fail if non-owner tries to set fee", async function () {
            await expect(
                mevDex.connect(user1).setFeeBps(50)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should fail if fee is too high", async function () {
            await expect(
                mevDex.connect(owner).setFeeBps(501)
            ).to.be.revertedWith("Fee too high");
        });

        it("Should allow owner to set DEX aggregator", async function () {
            const newAggregator = ethers.Wallet.createRandom().address;
            await mevDex.connect(owner).setDexAggregator(newAggregator);
            expect(await mevDex.dexAggregator()).to.equal(newAggregator);
        });

        it("Should allow owner to pause/unpause", async function () {
            await mevDex.connect(owner).pause();
            expect(await mevDex.paused()).to.be.true;

            await mevDex.connect(owner).unpause();
            expect(await mevDex.paused()).to.be.false;
        });
    });

    describe("View Functions", function () {
        it("Should return correct commitment validity", async function () {
            const commitment = ethers.utils.keccak256(ethers.utils.randomBytes(32));
            const commitmentFee = ethers.utils.parseEther("0.001");

            expect(await mevDex.isCommitmentValid(commitment)).to.be.false;

            await mevDex.connect(user1).commitSwap(commitment, { value: commitmentFee });
            expect(await mevDex.isCommitmentValid(commitment)).to.be.true;

            // After timeout
            await ethers.provider.send("evm_increaseTime", [3601]);
            await ethers.provider.send("evm_mine", []);
            expect(await mevDex.isCommitmentValid(commitment)).to.be.false;
        });
    });

    // Helper function to get current block timestamp
    async function time(): Promise<number> {
        return (await ethers.provider.getBlock("latest")).timestamp;
    }
});
