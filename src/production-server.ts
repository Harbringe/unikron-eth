import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

// Types
interface SwapRequest {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minAmountOut: string;
    deadline: number;
    salt: string;
    feeBps: number;
    slippageBps: number;
}

interface DexQuote {
    dexType: number;
    dexName: string;
    router: string;
    amountOut: string;
    gasEstimate: string;
    priceImpact: string;
    path: string[];
    routeData: string;
    isActive: boolean;
    reliability: string;
}

interface SwapParams {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minAmountOut: string;
    recipient: string;
    deadline: number;
    preferredDex: number;
    useMultiHop: boolean;
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const DEFAULT_NETWORK = process.env.DEFAULT_NETWORK || 'sepolia';

// Network configuration
const NETWORKS = {
    sepolia: {
        rpc: process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/your-sepolia-api-key',
        chainId: 11155111,
        name: 'Sepolia Testnet'
    },
    mainnet: {
        rpc: process.env.MAINNET_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/your-mainnet-api-key',
        chainId: 1,
        name: 'Ethereum Mainnet'
    }
};

function getCurrentNetwork() {
    return NETWORKS[DEFAULT_NETWORK as keyof typeof NETWORKS] || NETWORKS.sepolia;
}

const currentNetwork = getCurrentNetwork();
const RPC_URL = currentNetwork.rpc;
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0x1234567890123456789012345678901234567890123456789012345678901234';
const MEV_DEX_ADDRESS = process.env.CONTRACT_ADDRESS || process.env.MEV_DEX_ADDRESS;
const REAL_DEX_AGGREGATOR_ADDRESS = process.env.REAL_DEX_AGGREGATOR_ADDRESS;
const MULTI_DEX_ADDRESS = process.env.MULTI_DEX_ADDRESS;

if (!MEV_DEX_ADDRESS) {
    console.error('❌ MEV_DEX_ADDRESS not configured in environment variables');
    process.exit(1);
}

if (!REAL_DEX_AGGREGATOR_ADDRESS) {
    console.error('❌ REAL_DEX_AGGREGATOR_ADDRESS not configured in environment variables');
    process.exit(1);
}

// Ethereum provider and wallet
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// Contract ABIs
const MEV_DEX_ABI = [
    "function commitSwap(bytes32 commitment) external payable",
    "function revealAndSwap(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 deadline, bytes32 salt, uint256 feeBps, uint256 slippageBps) swapRequest, bytes32 commitment) external",
    "function cancelCommitment(bytes32 commitment) external",
    "function getCommitment(bytes32 commitment) external view returns(address user, uint256 timestamp, bool revealed, bool executed)",
    "function isCommitmentValid(bytes32 commitment) external view returns(bool)",
    "function getDefaultParameters() external view returns(uint256 fee, uint256 slippage)",
    "function getParameterLimits() external view returns(uint256 minFee, uint256 maxFee, uint256 minSlippage, uint256 maxSlippage)",
    "function calculateCommitment(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 deadline, bytes32 salt, uint256 feeBps, uint256 slippageBps, address user) external pure returns(bytes32)",
    "function getSwapQuote(address tokenIn, address tokenOut, uint256 amountIn) external view returns(uint256 amountOut, string bestDex, uint256 gasEstimate, uint256 priceImpact)"
];

const REAL_DEX_AGGREGATOR_ABI = [
    "function getAllQuotes(address tokenIn, address tokenOut, uint256 amountIn) external view returns(tuple(uint8 dexType, string dexName, address router, uint256 amountOut, uint256 gasEstimate, uint256 priceImpact, address[] path, bytes routeData, bool isActive, uint256 reliability)[] quotes)",
    "function getBestQuote(address tokenIn, address tokenOut, uint256 amountIn) external view returns(tuple(uint8 dexType, string dexName, address router, uint256 amountOut, uint256 gasEstimate, uint256 priceImpact, address[] path, bytes routeData, bool isActive, uint256 reliability) bestQuote)",
    "function executeSwap(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address recipient, uint256 deadline, uint8 preferredDex, bool useMultiHop) params) external returns(uint256 amountOut)",
    "function executeMevProtectedSwap(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address recipient, uint256 deadline, uint8 preferredDex, bool useMultiHop) params, bytes32 commitment) external returns(uint256 amountOut)",
    "function swapWithBestQuote(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address recipient, uint256 deadline) external returns(uint256 amountOut)",
    "function paused() external view returns(bool)",
    "function mevProtectedContracts(address) external view returns(bool)"
];

// Contract instances
const mevDex = new ethers.Contract(MEV_DEX_ADDRESS, MEV_DEX_ABI, wallet);
const realDexAggregator = new ethers.Contract(REAL_DEX_AGGREGATOR_ADDRESS, REAL_DEX_AGGREGATOR_ABI, wallet);

const app = express();
app.use(cors());
app.use(express.json());

// Helper functions
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
        const amount = BigInt(value);
        if (amount <= 0n) {
            return `${fieldName} must be a positive number`;
        }
        return null;
    } catch {
        return `${fieldName} must be a valid number`;
    }
}

// Health check with comprehensive status
app.get('/health', async (_, res) => {
    try {
        const [blockNumber, gasPrice, mevDexConnected, aggregatorConnected, aggregatorPaused, mevProtectionEnabled] = await Promise.all([
            provider.getBlockNumber(),
            provider.getFeeData().then(fee => fee.gasPrice?.toString()),
            mevDex.getDefaultParameters().then(() => true).catch(() => false),
            realDexAggregator.getBestQuote(
                "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
                "0xA0b86a33E6441b8c4C8C0b4b8C0b4b8C0b4b8C0b4", // USDC  
                ethers.parseEther("1")
            ).then(() => true).catch(() => false),
            realDexAggregator.paused().catch(() => false),
            realDexAggregator.mevProtectedContracts(MEV_DEX_ADDRESS).catch(() => false)
        ]);

        res.json({
            ok: true,
            network: currentNetwork.name,
            chainId: currentNetwork.chainId,
            blockNumber,
            gasPrice,
            contracts: {
                mevDex: {
                    address: MEV_DEX_ADDRESS,
                    connected: mevDexConnected,
                    mevProtectionEnabled: mevProtectionEnabled
                },
                realDexAggregator: {
                    address: REAL_DEX_AGGREGATOR_ADDRESS,
                    connected: aggregatorConnected,
                    paused: aggregatorPaused
                }
            },
            mevProtection: {
                enabled: mevProtectionEnabled,
                commitRevealActive: mevDexConnected && aggregatorConnected,
                status: mevProtectionEnabled ? "ACTIVE" : "DISABLED"
            },
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        res.status(500).json({
            ok: false,
            error: error.message,
            network: currentNetwork.name,
            chainId: currentNetwork.chainId,
            timestamp: new Date().toISOString()
        });
    }
});

// Get network information
app.get('/network', (_, res) => {
    res.json({
        current: DEFAULT_NETWORK,
        network: currentNetwork.name,
        chainId: currentNetwork.chainId,
        rpc: RPC_URL.includes('alchemy.com') ? RPC_URL.split('/').slice(0, -1).join('/') + '/***' : RPC_URL,
        contracts: {
            mevDex: MEV_DEX_ADDRESS,
            realDexAggregator: REAL_DEX_AGGREGATOR_ADDRESS,
            multiDex: MULTI_DEX_ADDRESS
        }
    });
});

// Get contract configuration
app.get('/contract-info', async (req, res) => {
    try {
        const [defaultParams, limits, quote] = await Promise.all([
            mevDex.getDefaultParameters(),
            mevDex.getParameterLimits(),
            // Test quote to verify aggregator integration
            mevDex.getSwapQuote(
                "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
                "0xA0b86a33E6441b8c4C8C0b4b8C0b4b8C0b4b8C0b4", // USDC
                ethers.parseEther("1")
            ).catch(() => [0, "Not Available", 0, 0])
        ]);

        const [defaultFee, defaultSlippage] = defaultParams;
        const [minFee, maxFee, minSlippage, maxSlippage] = limits;
        const [testAmountOut, testBestDex, testGasEstimate, testPriceImpact] = quote;

        res.json({
            address: MEV_DEX_ADDRESS,
            network: currentNetwork.name,
            chainId: currentNetwork.chainId,
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
            testQuote: {
                pair: "WETH/USDC",
                amountOut: testAmountOut.toString(),
                bestDex: testBestDex,
                gasEstimate: testGasEstimate.toString(),
                priceImpact: testPriceImpact.toString()
            },
            note: 'All values are in basis points (1 bps = 0.01%)'
        });
    } catch (e: any) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get contract info', { message: e.message });
    }
});

// Get real DEX quotes
app.get('/quotes', async (req, res) => {
    try {
        const { tokenIn, tokenOut, amount } = req.query as Record<string, string>;

        // Validate parameters
        const validationErrors: string[] = [];
        if (!tokenIn) validationErrors.push('tokenIn is required');
        if (!tokenOut) validationErrors.push('tokenOut is required');
        if (!amount) validationErrors.push('amount is required');

        if (tokenIn) {
            const err = validateAddress(tokenIn, 'tokenIn');
            if (err) validationErrors.push(err);
        }
        if (tokenOut) {
            const err = validateAddress(tokenOut, 'tokenOut');
            if (err) validationErrors.push(err);
        }
        if (amount) {
            const err = validateAmount(amount, 'amount');
            if (err) validationErrors.push(err);
        }

        if (validationErrors.length > 0) {
            return sendError(res, 400, 'BAD_REQUEST', 'Invalid query parameters', { errors: validationErrors });
        }

        // Get all quotes from real DEX aggregator
        const quotes = await realDexAggregator.getAllQuotes(tokenIn, tokenOut, amount);
        
        // Get best quote
        const bestQuote = await realDexAggregator.getBestQuote(tokenIn, tokenOut, amount);

        const formattedQuotes = quotes.map((quote: any) => ({
            dexType: Number(quote.dexType),
            dexName: quote.dexName,
            router: quote.router,
            amountOut: quote.amountOut.toString(),
            gasEstimate: quote.gasEstimate.toString(),
            priceImpact: quote.priceImpact.toString(),
            path: quote.path,
            routeData: quote.routeData,
            isActive: quote.isActive,
            reliability: quote.reliability.toString()
        }));

        const formattedBestQuote = {
            dexType: Number(bestQuote.dexType),
            dexName: bestQuote.dexName,
            router: bestQuote.router,
            amountOut: bestQuote.amountOut.toString(),
            gasEstimate: bestQuote.gasEstimate.toString(),
            priceImpact: bestQuote.priceImpact.toString(),
            path: bestQuote.path,
            routeData: bestQuote.routeData,
            isActive: bestQuote.isActive,
            reliability: bestQuote.reliability.toString()
        };

        res.json({
            tokenIn,
            tokenOut,
            amountIn: amount,
            quotes: formattedQuotes,
            bestQuote: formattedBestQuote,
            network: currentNetwork.name,
            chainId: currentNetwork.chainId,
            timestamp: new Date().toISOString()
        });

    } catch (e: any) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get quotes', { message: e.message });
    }
});

// Get best quote only
app.get('/best-quote', async (req, res) => {
    try {
        const { tokenIn, tokenOut, amount } = req.query as Record<string, string>;

        if (!tokenIn || !tokenOut || !amount) {
            return sendError(res, 400, 'BAD_REQUEST', 'Missing required parameters: tokenIn, tokenOut, amount');
        }

        const bestQuote = await realDexAggregator.getBestQuote(tokenIn, tokenOut, amount);

        res.json({
            tokenIn,
            tokenOut,
            amountIn: amount,
            bestQuote: {
                dexType: Number(bestQuote.dexType),
                dexName: bestQuote.dexName,
                router: bestQuote.router,
                amountOut: bestQuote.amountOut.toString(),
                gasEstimate: bestQuote.gasEstimate.toString(),
                priceImpact: bestQuote.priceImpact.toString(),
                path: bestQuote.path,
                routeData: bestQuote.routeData,
                isActive: bestQuote.isActive,
                reliability: bestQuote.reliability.toString()
            },
            network: currentNetwork.name,
            chainId: currentNetwork.chainId
        });
    } catch (e: any) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get best quote', { message: e.message });
    }
});

// MEV-protected swap - commit phase
app.post('/mev/commit', async (req, res) => {
    try {
        const {
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            feeBps = 30,
            slippageBps = 300,
            saltHex
        } = req.body;

        if (!tokenIn || !tokenOut || !amountIn || !minAmountOut) {
            return sendError(res, 400, 'BAD_REQUEST', 'Missing required parameters');
        }

        // Validate parameters
        const [minFee, maxFee, minSlippage, maxSlippage] = await mevDex.getParameterLimits();

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

        // Generate salt if not provided
        let salt = saltHex;
        if (!salt) {
            salt = ethers.hexlify(ethers.randomBytes(32));
        }

        const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

        // Calculate commitment
        const commitment = await mevDex.calculateCommitment(
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            deadline,
            salt,
            feeBps,
            slippageBps,
            wallet.address
        );

        // Execute commitment
        const commitTx = await mevDex.commitSwap(commitment, { 
            value: ethers.parseEther('0.001') // Commitment fee
        });
        const receipt = await commitTx.wait();

        res.json({
            success: true,
            commitment: commitment,
            salt: salt,
            deadline: deadline,
            commitmentTx: receipt.hash,
            swapRequest: {
                tokenIn,
                tokenOut,
                amountIn,
                minAmountOut,
                deadline,
                salt,
                feeBps,
                slippageBps
            },
            note: 'Commitment created. Use /mev/reveal to execute the swap.'
        });

    } catch (e: any) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create commitment', { message: e.message });
    }
});

// MEV-protected swap - reveal phase
app.post('/mev/reveal', async (req, res) => {
    try {
        const { swapRequest, commitment } = req.body;

        if (!swapRequest || !commitment) {
            return sendError(res, 400, 'BAD_REQUEST', 'Missing swapRequest or commitment');
        }

        // Verify commitment is still valid
        const isValid = await mevDex.isCommitmentValid(commitment);
        if (!isValid) {
            return res.status(400).json({ error: 'Commitment is invalid or expired' });
        }

        // Execute reveal and swap
        const revealTx = await mevDex.revealAndSwap(swapRequest, commitment);
        const receipt = await revealTx.wait();

        res.json({
            success: true,
            commitment: commitment,
            revealTx: receipt.hash,
            gasUsed: receipt.gasUsed.toString(),
            note: 'MEV-protected swap executed successfully'
        });

    } catch (e: any) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reveal and execute swap', { message: e.message });
    }
});

// Complete MEV-protected swap (commit + reveal in one call)
app.post('/mev/swap', async (req, res) => {
    try {
        const {
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            feeBps = 30,
            slippageBps = 300
        } = req.body;

        if (!tokenIn || !tokenOut || !amountIn || !minAmountOut) {
            return sendError(res, 400, 'BAD_REQUEST', 'Missing required parameters');
        }

        // Generate salt and deadline
        const salt = ethers.hexlify(ethers.randomBytes(32));
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        // Calculate commitment
        const commitment = await mevDex.calculateCommitment(
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            deadline,
            salt,
            feeBps,
            slippageBps,
            wallet.address
        );

        // Phase 1: Commit
        const commitTx = await mevDex.commitSwap(commitment, { 
            value: ethers.parseEther('0.001')
        });
        const commitReceipt = await commitTx.wait();

        // Phase 2: Reveal and execute
        const swapRequest = {
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            deadline,
            salt,
            feeBps,
            slippageBps
        };

        const revealTx = await mevDex.revealAndSwap(swapRequest, commitment);
        const revealReceipt = await revealTx.wait();

        res.json({
            success: true,
            swapType: 'MEV-Protected',
            commitment: commitment,
            commitmentTx: commitReceipt.hash,
            revealTx: revealReceipt.hash,
            totalGasUsed: (commitReceipt.gasUsed + revealReceipt.gasUsed).toString(),
            parameters: {
                feeBps,
                slippageBps,
                deadline
            },
            note: 'Complete MEV-protected swap executed successfully'
        });

    } catch (e: any) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to execute MEV swap', { message: e.message });
    }
});

// Regular swap (no MEV protection)
app.post('/swap', async (req, res) => {
    try {
        const {
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            recipient = wallet.address,
            preferredDex,
            useMultiHop = false
        } = req.body;

        if (!tokenIn || !tokenOut || !amountIn || !minAmountOut) {
            return sendError(res, 400, 'BAD_REQUEST', 'Missing required parameters');
        }

        const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes

        if (preferredDex !== undefined) {
            // Execute swap with specific DEX
            const swapParams: SwapParams = {
                tokenIn,
                tokenOut,
                amountIn,
                minAmountOut,
                recipient,
                deadline,
                preferredDex: Number(preferredDex),
                useMultiHop
            };

            const amountOut = await realDexAggregator.executeSwap(swapParams);
            
            res.json({
                success: true,
                swapType: 'Regular (No MEV Protection)',
                amountOut: amountOut.toString(),
                preferredDex: preferredDex,
                warning: 'This swap is vulnerable to front-running. Consider using MEV protection.'
            });
        } else {
            // Execute swap with best quote
            const amountOut = await realDexAggregator.swapWithBestQuote(
                tokenIn,
                tokenOut,
                amountIn,
                minAmountOut,
                recipient,
                deadline
            );

            res.json({
                success: true,
                swapType: 'Regular (Best Quote)',
                amountOut: amountOut.toString(),
                warning: 'This swap is vulnerable to front-running. Consider using MEV protection.'
            });
        }

    } catch (e: any) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to execute swap', { message: e.message });
    }
});

// Get commitment status
app.get('/commitment/:commitment', async (req, res) => {
    try {
        const { commitment } = req.params;

        if (!commitment || !ethers.isHexString(commitment, 32)) {
            return res.status(400).json({ error: 'Invalid commitment hash' });
        }

        const [user, timestamp, revealed, executed] = await mevDex.getCommitment(commitment);
        const isValid = await mevDex.isCommitmentValid(commitment);

        const currentTime = Math.floor(Date.now() / 1000);
        const timeRemaining = Math.max(0, Number(timestamp) + 3600 - currentTime); // 1 hour timeout

        res.json({
            commitment,
            user,
            timestamp: timestamp.toString(),
            revealed,
            executed,
            isValid,
            timeRemaining,
            status: executed ? 'executed' : revealed ? 'revealed' : isValid ? 'pending' : 'expired'
        });
    } catch (e: any) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get commitment status', { message: e.message });
    }
});

// Cancel commitment
app.post('/commitment/cancel', async (req, res) => {
    try {
        const { commitment } = req.body;

        if (!commitment) {
            return sendError(res, 400, 'BAD_REQUEST', 'Missing commitment hash');
        }

        const tx = await mevDex.cancelCommitment(commitment);
        const receipt = await tx.wait();

        res.json({
            success: true,
            commitment: commitment,
            cancelTx: receipt.hash,
            note: 'Commitment cancelled and fee refunded'
        });
    } catch (e: any) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to cancel commitment', { message: e.message });
    }
});

// Get MEV protection status
app.get('/mev/status', async (req, res) => {
    try {
        const [mevProtectionEnabled, aggregatorPaused, mevDexConnected] = await Promise.all([
            realDexAggregator.mevProtectedContracts(MEV_DEX_ADDRESS).catch(() => false),
            realDexAggregator.paused().catch(() => false),
            mevDex.getDefaultParameters().then(() => true).catch(() => false)
        ]);

        res.json({
            mevProtection: {
                enabled: mevProtectionEnabled,
                contractAddress: MEV_DEX_ADDRESS,
                aggregatorPaused: aggregatorPaused,
                commitRevealActive: mevDexConnected && mevProtectionEnabled && !aggregatorPaused,
                status: mevProtectionEnabled && !aggregatorPaused ? "FULLY_PROTECTED" : "PARTIAL_OR_DISABLED"
            },
            features: {
                commitRevealPattern: mevDexConnected,
                timeLockSecurity: mevDexConnected,
                cryptographicCommitments: mevDexConnected,
                transactionObfuscation: mevProtectionEnabled,
                frontRunningPrevention: mevProtectionEnabled && !aggregatorPaused
            },
            network: currentNetwork.name,
            chainId: currentNetwork.chainId,
            timestamp: new Date().toISOString()
        });
    } catch (e: any) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get MEV protection status', { message: e.message });
    }
});

// Get gas price information
app.get('/gas', async (req, res) => {
    try {
        const feeData = await provider.getFeeData();
        const block = await provider.getBlock('latest');

        res.json({
            gasPrice: feeData.gasPrice?.toString(),
            maxFeePerGas: feeData.maxFeePerGas?.toString(),
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
            baseFeePerGas: block?.baseFeePerGas?.toString(),
            network: currentNetwork.name,
            chainId: currentNetwork.chainId
        });
    } catch (e: any) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get gas information', { message: e.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Production Unikron DEX Server running on port ${PORT}`);
    console.log(`🌐 Network: ${currentNetwork.name} (Chain ID: ${currentNetwork.chainId})`);
    console.log(`🛡️  MEV Protection: Enabled`);
    console.log(`🔄 Real DEX Integration: Active`);
    console.log(`📊 Supports: Uniswap V2/V3, SushiSwap, 1inch, Curve`);
    console.log(`⚡ Auto-selection: Best price + lowest gas`);
    console.log(`🔧 Contract Addresses:`);
    console.log(`   MEVDex: ${MEV_DEX_ADDRESS}`);
    console.log(`   RealDexAggregator: ${REAL_DEX_AGGREGATOR_ADDRESS}`);
    console.log(`   MultiDex: ${MULTI_DEX_ADDRESS || 'Not configured'}`);
});

export default app;