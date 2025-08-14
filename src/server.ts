import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { ethers } from 'ethers';
import keccak256 from 'keccak256';
import path from 'path';
import fs from 'fs';
import * as crypto from 'crypto';

// Types
interface SwapRequest {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minAmountOut: string;
    deadline: number;
    salt: string;
}

interface QuoteResponse {
    inputMint: string;
    outputMint: string;
    amount: string;
    otherAmountThreshold: string;
    swapMode: string;
    slippageBps: number;
    platformFee?: {
        feeBps: number;
        feeAccounts: any;
    };
    priceImpactPct: string;
    routePlan: any[];
    contextSlot: number;
    timeTaken: number;
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0x1234567890123456789012345678901234567890123456789012345678901234';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';

// Ethereum provider and wallet
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// Contract ABIs
const CONTRACT_ABI = [
    "function commitSwap(bytes32 commitment) external payable",
    "function revealAndSwap(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 deadline, bytes32 salt, uint256 feeBps, uint256 slippageBps) swapRequest, bytes32 commitment) external",
    "function cancelCommitment(bytes32 commitment) external",
    "function getCommitment(bytes32 commitment) external view returns(address user, uint256 timestamp, bool revealed, bool executed)",
    "function isCommitmentValid(bytes32 commitment) external view returns(bool)",
    "function getDefaultParameters() external view returns(uint256 fee, uint256 slippage)",
    "function getParameterLimits() external view returns(uint256 minFee, uint256 maxFee, uint256 minSlippage, uint256 maxSlippage)",
    "function calculateCommitment(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 deadline, bytes32 salt, uint256 feeBps, uint256 slippageBps, address user) external pure returns(bytes32)"
];

// Contract instance
const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

const app = express();
app.use(cors());
app.use(express.json());

// Basic helpers for consistent error responses
function sendError(res: any, status: number, code: string, message: string, details?: any) {
    return res.status(status).json({ error: { code, message, details } });
}

function validateAddress(value: string, fieldName: string) {
    try {
        if (!ethers.isAddress(value)) {
            return `${fieldName} is not a valid Ethereum address`;
        }
        return null;
    } catch {
        return `${fieldName} is not a valid Ethereum address`;
    }
}

function validateAmount(value: string, fieldName: string) {
    try {
        const amount = ethers.parseUnits(value, 'wei');
        if (amount <= 0n) {
            return `${fieldName} must be a positive number`;
        }
        return null;
    } catch {
        return `${fieldName} must be a valid number`;
    }
}

app.get('/health', (_, res) => res.json({ ok: true }));

// Get current gas price
app.get('/gas-price', async (req, res) => {
    try {
        const gasPrice = await provider.getFeeData();
        res.json({
            gasPrice: gasPrice.gasPrice?.toString(),
            maxFeePerGas: gasPrice.maxFeePerGas?.toString(),
            maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas?.toString()
        });
    } catch (e: any) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get gas price', { message: e.message });
    }
});

// Get contract info
app.get('/contract-info', async (req, res) => {
    try {
        const [defaultFee, defaultSlippage] = await contract.getDefaultParameters();
        const [minFee, maxFee, minSlippage, maxSlippage] = await contract.getParameterLimits();

        res.json({
            address: CONTRACT_ADDRESS,
            defaults: {
                feeBps: Number(defaultFee),
                slippageBps: Number(defaultSlippage)
            },
            limits: {
                minFeeBps: Number(minFee),
                maxFeeBps: Number(maxFee),
                minSlippageBps: Number(minSlippage),
                maxSlippageBps: Number(maxSlippage)
            },
            note: 'All values are in basis points (1 bps = 0.01%)'
        });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Get parameter limits
app.get('/parameters/limits', async (req, res) => {
    try {
        const [minFee, maxFee, minSlippage, maxSlippage] = await contract.getParameterLimits();

        res.json({
            fee: {
                min: Number(minFee),
                max: Number(maxFee),
                unit: 'basis points (0.01%)'
            },
            slippage: {
                min: Number(minSlippage),
                max: Number(maxSlippage),
                unit: 'basis points (0.01%)'
            }
        });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Get default parameters
app.get('/parameters/defaults', async (req, res) => {
    try {
        const [defaultFee, defaultSlippage] = await contract.getDefaultParameters();

        res.json({
            feeBps: Number(defaultFee),
            slippageBps: Number(defaultSlippage),
            note: 'These are the default values if not specified by user'
        });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Jupiter quote proxy (kept for compatibility, but adapted for Ethereum)
app.get('/quote', async (req, res) => {
    try {
        const { inputMint, outputMint, amount } = req.query as Record<string, string>;

        // allow client-controlled slippage (basis points). default 100 = 1%
        let { slippageBps } = req.query as Record<string, string>;
        if (slippageBps === undefined || slippageBps === null || slippageBps === '') {
            slippageBps = '100';
        }
        // normalize to string and basic sanity clamp
        const normalizedSlippage = Math.max(0, Math.min(10000, Number(slippageBps)));
        slippageBps = String(Number.isFinite(normalizedSlippage) ? normalizedSlippage : 100);

        // Validate parameters
        const validationErrors: string[] = [];
        if (!inputMint) validationErrors.push('inputMint is required');
        if (!outputMint) validationErrors.push('outputMint is required');
        if (!amount) validationErrors.push('amount is required');

        if (inputMint) {
            const err = validateAddress(inputMint, 'inputMint');
            if (err) validationErrors.push(err);
        }
        if (outputMint) {
            const err = validateAddress(outputMint, 'outputMint');
            if (err) validationErrors.push(err);
        }
        if (amount) {
            const err = validateAmount(amount, 'amount');
            if (err) validationErrors.push(err);
        }

        if (validationErrors.length > 0) {
            return sendError(res, 400, 'BAD_REQUEST', 'Invalid query parameters', { errors: validationErrors });
        }

        // For Ethereum, we'll simulate a quote since Jupiter is Solana-specific
        // In practice, you'd integrate with 1inch, 0x, or other Ethereum DEX aggregators
        const simulatedQuote: QuoteResponse = {
            inputMint,
            outputMint,
            amount,
            otherAmountThreshold: (BigInt(amount) * BigInt(95) / BigInt(100)).toString(), // 5% slippage
            swapMode: 'ExactIn',
            slippageBps: Number(slippageBps),
            priceImpactPct: '0.5',
            routePlan: [],
            contextSlot: 0,
            timeTaken: 0
        };

        return res.json(simulatedQuote);
    } catch (e: any) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected server error', { message: e.message });
    }
});

// Create a swap transaction from a provided quoteResponse
app.post('/swap-tx', async (req, res) => {
    try {
        const {
            quoteResponse,
            userPublicKey,
            wrapAndUnwrapSol = true,
            dynamicComputeUnitLimit = true,
            prioritizationFeeLamports = 'auto',
        } = req.body || {};

        if (!quoteResponse || !userPublicKey) {
            return res.status(400).json({ error: 'Missing quoteResponse or userPublicKey' });
        }

        // For Ethereum, we'll create a simulated swap transaction
        // In practice, you'd integrate with actual DEX aggregators
        const swapTx = {
            swapTransaction: '0x', // Simulated transaction hash
            inputMint: quoteResponse.inputMint,
            outputMint: quoteResponse.outputMint,
            amount: quoteResponse.amount,
            otherAmountThreshold: quoteResponse.otherAmountThreshold
        };

        res.json(swapTx);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Convenience: quote with custom slippage and immediately create a swap transaction
app.post('/quote-and-swap', async (req, res) => {
    try {
        const {
            inputMint,
            outputMint,
            amount,
            slippageBps = 100,
            userPublicKey,
        } = req.body || {};

        if (!inputMint || !outputMint || !amount || !userPublicKey) {
            return res.status(400).json({ error: 'Missing body fields' });
        }

        // Simulate quote and swap for Ethereum
        const quote = {
            inputMint,
            outputMint,
            amount,
            otherAmountThreshold: (BigInt(amount) * BigInt(95) / BigInt(100)).toString(),
            swapMode: 'ExactIn',
            slippageBps: Number(slippageBps),
            priceImpactPct: '0.5',
            routePlan: [],
            contextSlot: 0,
            timeTaken: 0
        };

        const swap = {
            swapTransaction: '0x',
            inputMint,
            outputMint,
            amount,
            otherAmountThreshold: quote.otherAmountThreshold
        };

        res.json({ quote, swap });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// MEV-protected flow helper - commit -> quote -> reveal (no Jupiter execution yet)
app.post('/commit-reveal-swap', async (req, res) => {
    try {
        const {
            tokenIn,
            tokenOut,
            amount,
            minAmountOut,
            saltHex, // if not provided, auto-generate
            slippageBps = 300, // default 3%
            feeBps = 30, // default 0.3%
        } = req.body || {};

        if (!tokenIn || !tokenOut || !amount) {
            return res.status(400).json({ error: 'Missing tokenIn/tokenOut/amount' });
        }

        // Validate parameters
        const [minFee, maxFee, minSlippage, maxSlippage] = await contract.getParameterLimits();

        if (feeBps < Number(minFee) || feeBps > Number(maxFee)) {
            return res.status(400).json({
                error: `Fee must be between ${minFee} and ${maxFee} basis points`
            });
        }

        if (slippageBps < Number(minSlippage) || slippageBps > Number(maxSlippage)) {
            return res.status(400).json({
                error: `Slippage must be between ${minSlippage} and ${maxSlippage} basis points`
            });
        }

        let saltHexLocal = saltHex;
        if (!saltHexLocal) {
            const rnd = new Uint8Array(32);
            require('crypto').randomFillSync(rnd);
            saltHexLocal = '0x' + Buffer.from(rnd).toString('hex');
        }

        const deadline = Math.floor(Date.now() / 1000) + 3600;

        // Create swap request with configurable parameters
        const swapRequest = {
            tokenIn,
            tokenOut,
            amountIn: amount,
            minAmountOut,
            deadline,
            salt: saltHexLocal,
            feeBps,
            slippageBps
        };

        // Create commitment hash including fee and slippage
        const commitmentData = ethers.solidityPacked(
            ['address', 'address', 'uint256', 'uint256', 'uint256', 'bytes32', 'uint256', 'uint256', 'address'],
            [tokenIn, tokenOut, amount, minAmountOut, deadline, saltHexLocal, feeBps, slippageBps, wallet.address]
        );
        const commitment = ethers.keccak256(commitmentData);

        // 1) Commit
        const commitTx = await contract.commitSwap(commitment, { value: ethers.parseEther('0.001') });
        const commitReceipt = await commitTx.wait();

        // 2) Quote (simulated for Ethereum)
        let quote: any = null;
        try {
            quote = {
                inputMint: tokenIn,
                outputMint: tokenOut,
                amount,
                amountOut: (BigInt(amount) * BigInt(100 - slippageBps / 10)) / BigInt(100), // Apply slippage
                feeBps,
                slippageBps,
                note: 'Simulated quote with configurable parameters'
            };
        } catch (quoteError: any) {
            console.log("⚠️ Quote failed:", quoteError.message);
            quote = { error: 'Quote failed', note: 'Continuing without quote' };
        }

        // 3) Reveal and execute swap
        const revealTx = await contract.revealAndSwap(swapRequest, commitment);
        const revealReceipt = await revealTx.wait();

        res.json({
            commitment,
            saltHex: saltHexLocal,
            commitTx: commitReceipt?.hash,
            quote,
            revealTx: revealReceipt?.hash,
            parameters: {
                feeBps,
                slippageBps,
                feeAmount: (BigInt(amount) * BigInt(feeBps)) / BigInt(10000),
                note: 'MEV-protected swap executed with custom parameters'
            }
        });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Commit (server wallet signs, for testing)
app.post('/commit', async (req, res) => {
    try {
        const {
            tokenIn,
            tokenOut,
            amount,
            saltHex,
            feeBps = 30, // default 0.3%
            slippageBps = 300 // default 3%
        } = req.body as {
            tokenIn: string,
            tokenOut: string,
            amount: string | number,
            saltHex: string,
            feeBps?: number,
            slippageBps?: number
        };

        if (!tokenIn || !tokenOut || !amount || !saltHex) {
            return res.status(400).json({ error: 'Missing body fields' });
        }

        // Validate parameters
        const [minFee, maxFee, minSlippage, maxSlippage] = await contract.getParameterLimits();

        if (feeBps < Number(minFee) || feeBps > Number(maxFee)) {
            return res.status(400).json({
                error: `Fee must be between ${minFee} and ${maxFee} basis points`
            });
        }

        if (slippageBps < Number(minSlippage) || slippageBps > Number(maxSlippage)) {
            return res.status(400).json({
                error: `Slippage must be between ${minSlippage} and ${maxSlippage} basis points`
            });
        }

        const deadline = Math.floor(Date.now() / 1000) + 3600;

        // Create commitment hash including fee and slippage
        const commitmentData = ethers.solidityPacked(
            ['address', 'address', 'uint256', 'uint256', 'uint256', 'bytes32', 'uint256', 'uint256', 'address'],
            [tokenIn, tokenOut, amount, '0', deadline, saltHex, feeBps, slippageBps, wallet.address]
        );
        const commitment = ethers.keccak256(commitmentData);

        const [sessionPda] = PublicKey.findProgramAddressSync([
            Buffer.from('session'),
            wallet.publicKey.toBuffer()
        ], program.programId);

        const commitTx = await program.methods
            .commitSwap(Array.from(commitment))
            .accounts({
                session: sessionPda,
                user: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        res.json({
            txSig: commitTx,
            sessionPda: sessionPda.toBase58(),
            commitment: '0x' + Buffer.from(commitment).toString('hex'),
            parameters: { feeBps, slippageBps }
        });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Reveal without executing Jupiter (proof commit-reveal works end-to-end)
app.post('/reveal', async (req, res) => {
    try {
        const {
            tokenIn,
            tokenOut,
            amount,
            saltHex,
            minAmountOut = '0',
            feeBps = 30, // default 0.3%
            slippageBps = 300 // default 3%
        } = req.body as {
            tokenIn: string,
            tokenOut: string,
            amount: string | number,
            saltHex: string,
            minAmountOut?: string,
            feeBps?: number,
            slippageBps?: number
        };

        const deadline = Math.floor(Date.now() / 1000) + 3600;

        // Create swap request with configurable parameters
        const swapRequest = {
            tokenIn,
            tokenOut,
            amountIn: amount,
            minAmountOut,
            deadline,
            salt: saltHex,
            feeBps,
            slippageBps
        };

        // Create commitment hash including fee and slippage
        const commitmentData = ethers.solidityPacked(
            ['address', 'address', 'uint256', 'uint256', 'uint256', 'bytes32', 'uint256', 'uint256', 'address'],
            [tokenIn, tokenOut, amount, minAmountOut, deadline, saltHex, feeBps, slippageBps, wallet.address]
        );
        const commitment = ethers.keccak256(commitmentData);

        // Execute reveal and swap
        const tx = await contract.revealAndSwap(swapRequest, commitment);
        const receipt = await tx.wait();

        res.json({
            txHash: receipt?.hash,
            commitment: commitment,
            parameters: { feeBps, slippageBps }
        });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Get commitment status
app.get('/commitment/:commitment', async (req, res) => {
    try {
        const { commitment } = req.params;

        if (!commitment || !ethers.isHexString(commitment, 32)) {
            return res.status(400).json({ error: 'Invalid commitment hash' });
        }

        const commitmentData = await contract.getCommitment(commitment);
        const isValid = await contract.isCommitmentValid(commitment);

        res.json({
            commitment,
            user: commitmentData[0],
            timestamp: commitmentData[1].toString(),
            revealed: commitmentData[2],
            executed: commitmentData[3],
            isValid
        });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Cancel commitment
app.post('/cancel-commitment', async (req, res) => {
    try {
        const { commitment } = req.body;

        if (!commitment) {
            return res.status(400).json({ error: 'Missing commitment hash' });
        }

        const tx = await contract.cancelCommitment(commitment);
        const receipt = await tx.wait();

        res.json({
            txHash: receipt?.hash,
            commitment: commitment
        });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log(`Ethereum MEV-Protected DEX Server running on port ${PORT}`));
