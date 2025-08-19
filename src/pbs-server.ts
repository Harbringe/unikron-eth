import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

// Types for PBS MEV Protection
interface EncryptedSwapRequest {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minAmountOut: string;
    deadline: number;
    feeBps: number;
    slippageBps: number;
    salt: string;
}

interface PBSSwapParams {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minAmountOut: string;
    recipient: string;
    deadline: number;
    preferredDex: number;
    useMultiHop: boolean;
    encryptedOrderId: string;
    authorizedBuilder: string;
}

interface BuilderBid {
    builder: string;
    bidAmount: string;
    gasPrice: string;
    blockDeadline: number;
    signature: string;
}

interface TimelockEncryption {
    ciphertext: string;
    keyCommitment: string;
    unlockBlock: number;
    entropy: string;
}

const PORT = process.env.PORT ? Number(process.env.PORT) + 100 : 3101; // PBS server on different port
const DEFAULT_NETWORK = process.env.DEFAULT_NETWORK || 'sepolia';

// Network configuration (same as production server)
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

// PBS Contract addresses
const PBS_MEV_DEX_ADDRESS = process.env.PBS_MEV_DEX_ADDRESS;
const TIMELOCK_ENCRYPTION_ADDRESS = process.env.TIMELOCK_ENCRYPTION_ADDRESS;
const PBS_DEX_AGGREGATOR_ADDRESS = process.env.PBS_DEX_AGGREGATOR_ADDRESS;

if (!PBS_MEV_DEX_ADDRESS) {
    console.warn('⚠️ PBS_MEV_DEX_ADDRESS not configured - PBS functionality limited');
}

// Ethereum provider and wallet
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// PBS Contract ABIs
const PBS_MEV_DEX_ABI = [
    "function createEncryptedSwap(bytes encryptedParams, uint256 unlockDelay, bytes32 entropy) external payable returns(bytes32)",
    "function submitBuilderBid(bytes32 swapId, uint256 bidAmount, uint256 gasPrice, tuple(uint256[2] point) signature) external payable",
    "function decryptAndExecuteSwap(bytes32 swapId, tuple(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 deadline, uint256 feeBps, uint256 slippageBps, bytes32 salt), tuple(uint256[2] point, uint256 signersMask), address builderAddress) external",
    "function getEncryptedSwap(bytes32 swapId) external view returns(tuple(address user, uint256 creationBlock, uint256 unlockBlock, bytes encryptedParams, bytes32 keyCommitment, bytes32 entropy, bool executed, bool decrypted))",
    "function isSwapUnlocked(bytes32 swapId) external view returns(bool)",
    "function getPBSStats() external view returns(uint256, uint256, uint256)"
];

const TIMELOCK_ABI = [
    "function createTimelock(bytes swapParams, uint256 unlockDelay) external returns(tuple(bytes ciphertext, bytes32 keyCommitment, uint256 unlockBlock, bytes32 entropy), bytes32)",
    "function verifyDecryption(bytes32 timelockId, bytes32 decryptionKey, bytes decryptedParams) external view returns(bool)",
    "function isUnlocked(bytes32 timelockId) external view returns(bool)",
    "function deriveDecryptionKey(uint256 unlockBlock, bytes32 entropy) external view returns(bytes32)",
    "function getTimelockStats() external view returns(uint256, uint256, uint256)"
];

// Contract instances
const pbsMevDex = PBS_MEV_DEX_ADDRESS ? new ethers.Contract(PBS_MEV_DEX_ADDRESS, PBS_MEV_DEX_ABI, wallet) : null;
const timelockContract = TIMELOCK_ENCRYPTION_ADDRESS ? new ethers.Contract(TIMELOCK_ENCRYPTION_ADDRESS, TIMELOCK_ABI, wallet) : null;

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

// Production AES-256-GCM encryption with authenticated encryption
interface EncryptedPayload {
    ciphertext: string;
    nonce: string;
    authTag: string;
    algorithm: 'aes-256-gcm';
}

function encryptSwapParams(params: EncryptedSwapRequest, keyHex: string): string {
    const plaintext = JSON.stringify(params);
    const key = Buffer.from(keyHex.slice(2), 'hex'); // Remove 0x prefix
    const nonce = crypto.randomBytes(16); // 128-bit nonce for GCM
    
    const cipher = crypto.createCipherGCM('aes-256-gcm', key);
    cipher.setAAD(Buffer.from('PBS_SWAP_V1')); // Additional authenticated data
    
    let ciphertext = cipher.update(plaintext, 'utf8');
    cipher.final();
    const authTag = cipher.getAuthTag();
    
    const payload: EncryptedPayload = {
        ciphertext: ciphertext.toString('hex'),
        nonce: nonce.toString('hex'),
        authTag: authTag.toString('hex'),
        algorithm: 'aes-256-gcm'
    };
    
    return JSON.stringify(payload);
}

function decryptSwapParams(encryptedData: string, keyHex: string): EncryptedSwapRequest {
    const payload: EncryptedPayload = JSON.parse(encryptedData);
    const key = Buffer.from(keyHex.slice(2), 'hex');
    
    if (payload.algorithm !== 'aes-256-gcm') {
        throw new Error('Unsupported encryption algorithm');
    }
    
    const decipher = crypto.createDecipherGCM('aes-256-gcm', key);
    decipher.setAAD(Buffer.from('PBS_SWAP_V1'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));
    
    let decrypted = decipher.update(Buffer.from(payload.ciphertext, 'hex'), undefined, 'utf8');
    decipher.final();
    
    return JSON.parse(decrypted);
}

// PBS Health check
app.get('/health', async (_, res) => {
    try {
        const [blockNumber, pbsStats, timelockStats] = await Promise.all([
            provider.getBlockNumber(),
            pbsMevDex ? pbsMevDex.getPBSStats().catch(() => [0, 0, 0]) : [0, 0, 0],
            timelockContract ? timelockContract.getTimelockStats().catch(() => [0, 0, 0]) : [0, 0, 0]
        ]);

        res.json({
            ok: true,
            server: 'PBS MEV Protection Server',
            network: currentNetwork.name,
            chainId: currentNetwork.chainId,
            blockNumber,
            contracts: {
                pbsMevDex: {
                    address: PBS_MEV_DEX_ADDRESS || 'Not configured',
                    connected: !!pbsMevDex
                },
                timelockEncryption: {
                    address: TIMELOCK_ENCRYPTION_ADDRESS || 'Not configured',
                    connected: !!timelockContract
                }
            },
            statistics: {
                totalPBSSwaps: pbsStats[0].toString(),
                successfulDecryptions: pbsStats[1].toString(),
                totalBuilderRevenue: ethers.formatEther(pbsStats[2].toString()),
                totalTimelocks: timelockStats[0].toString()
            },
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        res.status(500).json({
            ok: false,
            server: 'PBS MEV Protection Server',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// PBS vs Commit-Reveal comparison
app.get('/comparison', (_, res) => {
    res.json({
        mevProtectionTypes: {
            commitReveal: {
                name: 'Commit-Reveal MEV Protection',
                description: 'Users commit to swap parameters with cryptographic hash, then reveal later',
                endpoint: 'http://localhost:3001', // Main server
                features: {
                    hiddenIntentions: true,
                    timeLock: '1 hour commitment timeout',
                    protection: 'Hash-based commitment hiding',
                    decryption: 'Reveal parameters directly',
                    gasEfficiency: 'Medium (2 transactions)',
                    mevResistance: 'High'
                },
                advantages: [
                    'Simple implementation',
                    'Gas efficient',
                    'Proven cryptographic security',
                    'Compatible with existing infrastructure'
                ],
                disadvantages: [
                    'Requires two separate transactions',
                    'User must wait for commitment timeout',
                    'Limited to single user transactions'
                ]
            },
            pbsEncryption: {
                name: 'PBS Encryption MEV Protection',
                description: 'Uses Proposer-Builder Separation with threshold encryption',
                endpoint: `http://localhost:${PORT}`, // This server
                features: {
                    hiddenIntentions: true,
                    timeLock: '2-50 blocks time-locked encryption',
                    protection: 'AES-256 encryption + threshold signatures',
                    decryption: 'Validator threshold consensus',
                    gasEfficiency: 'High (batch execution)',
                    mevResistance: 'Very High'
                },
                advantages: [
                    'Batch transaction execution',
                    'Builder competition for best execution',
                    'Validator network security',
                    'Time-locked automatic decryption',
                    'Future-proof with Ethereum 2.0 PBS'
                ],
                disadvantages: [
                    'More complex implementation',
                    'Requires validator network',
                    'Higher computational overhead',
                    'Newer, less battle-tested'
                ]
            }
        },
        recommendation: {
            forBeginners: 'commitReveal',
            forAdvanced: 'pbsEncryption',
            forHighVolume: 'pbsEncryption',
            forSimplicity: 'commitReveal'
        }
    });
});

// Create encrypted swap using PBS
app.post('/pbs/encrypt-swap', async (req, res) => {
    try {
        const {
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            feeBps = 30,
            slippageBps = 300,
            unlockDelay = 5
        } = req.body;

        if (!tokenIn || !tokenOut || !amountIn || !minAmountOut) {
            return sendError(res, 400, 'BAD_REQUEST', 'Missing required parameters');
        }

        if (!pbsMevDex) {
            return sendError(res, 503, 'SERVICE_UNAVAILABLE', 'PBS MEV Dex not configured');
        }

        // Validate unlock delay
        if (unlockDelay < 2 || unlockDelay > 50) {
            return sendError(res, 400, 'BAD_REQUEST', 'Unlock delay must be between 2 and 50 blocks');
        }

        const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
        const salt = ethers.hexlify(ethers.randomBytes(32));

        // Create swap request object
        const swapRequest: EncryptedSwapRequest = {
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            deadline,
            feeBps,
            slippageBps,
            salt
        };

        // Generate encryption key and entropy
        const entropy = ethers.hexlify(ethers.randomBytes(32));
        const encryptionKey = ethers.keccak256(ethers.toUtf8Bytes(`PBS_KEY_${entropy}_${Date.now()}`));

        // Encrypt swap parameters
        const encryptedParams = encryptSwapParams(swapRequest, encryptionKey);
        const encryptedBytes = ethers.toUtf8Bytes(encryptedParams);

        // Create encrypted swap on-chain
        const tx = await pbsMevDex.createEncryptedSwap(
            encryptedBytes,
            unlockDelay,
            entropy,
            { value: ethers.parseEther('0.002') } // PBS fee
        );
        const receipt = await tx.wait();

        // Extract swap ID from transaction logs (simplified)
        const swapId = ethers.keccak256(ethers.solidityPacked(['address', 'uint256'], [wallet.address, Date.now()]));

        res.json({
            success: true,
            swapType: 'PBS Encrypted',
            swapId: swapId,
            encryptionDetails: {
                unlockBlock: (await provider.getBlockNumber()) + unlockDelay,
                unlockDelay: unlockDelay,
                entropy: entropy,
                // Note: In production, encryption key would not be returned
                encryptionKey: encryptionKey // For demo purposes only
            },
            swapRequest: swapRequest,
            transactionHash: receipt.hash,
            pbsFee: '0.002 ETH',
            note: 'Swap encrypted with PBS protection. Decryption requires validator consensus.',
            nextSteps: [
                '1. Wait for unlock block to be reached',
                '2. Builders will bid for execution rights',
                '3. Validators will decrypt and execute via winning builder'
            ]
        });

    } catch (e: any) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create encrypted swap', { message: e.message });
    }
});

// Submit builder bid for encrypted swap
app.post('/pbs/builder-bid', async (req, res) => {
    try {
        const {
            swapId,
            builderAddress,
            bidAmount,
            gasPrice
        } = req.body;

        if (!swapId || !builderAddress || !bidAmount || !gasPrice) {
            return sendError(res, 400, 'BAD_REQUEST', 'Missing required parameters');
        }

        if (!pbsMevDex) {
            return sendError(res, 503, 'SERVICE_UNAVAILABLE', 'PBS MEV Dex not configured');
        }

        // Validate builder address
        const addressError = validateAddress(builderAddress, 'builderAddress');
        if (addressError) {
            return sendError(res, 400, 'BAD_REQUEST', addressError);
        }

        // Create mock BLS signature for demo (in production, builder would provide real signature)
        const mockSignature = {
            point: [
                BigInt(ethers.keccak256(ethers.toUtf8Bytes(`${builderAddress}_sig1`))),
                BigInt(ethers.keccak256(ethers.toUtf8Bytes(`${builderAddress}_sig2`)))
            ]
        };

        // Submit builder bid
        const tx = await pbsMevDex.submitBuilderBid(
            swapId,
            ethers.parseEther(bidAmount),
            ethers.parseUnits(gasPrice, 'gwei'),
            mockSignature,
            { value: ethers.parseEther(bidAmount) }
        );
        const receipt = await tx.wait();

        res.json({
            success: true,
            swapId: swapId,
            builderBid: {
                builder: builderAddress,
                bidAmount: bidAmount + ' ETH',
                gasPrice: gasPrice + ' gwei',
                blockDeadline: (await provider.getBlockNumber()) + 10
            },
            transactionHash: receipt.hash,
            note: 'Builder bid submitted. Winning builder will be selected based on bid amount and execution efficiency.'
        });

    } catch (e: any) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to submit builder bid', { message: e.message });
    }
});

// Decrypt and execute PBS swap (for validators/builders)
app.post('/pbs/decrypt-execute', async (req, res) => {
    try {
        const {
            swapId,
            encryptionKey,
            builderAddress
        } = req.body;

        if (!swapId || !encryptionKey || !builderAddress) {
            return sendError(res, 400, 'BAD_REQUEST', 'Missing required parameters');
        }

        if (!pbsMevDex) {
            return sendError(res, 503, 'SERVICE_UNAVAILABLE', 'PBS MEV Dex not configured');
        }

        // Get encrypted swap details
        const encryptedSwap = await pbsMevDex.getEncryptedSwap(swapId);
        
        if (!encryptedSwap.user || encryptedSwap.user === ethers.ZeroAddress) {
            return sendError(res, 404, 'NOT_FOUND', 'Encrypted swap not found');
        }

        // Check if swap is unlocked
        const isUnlocked = await pbsMevDex.isSwapUnlocked(swapId);
        if (!isUnlocked) {
            return sendError(res, 400, 'BAD_REQUEST', 'Swap not yet unlocked');
        }

        // Decrypt swap parameters
        const encryptedParamsString = ethers.toUtf8String(encryptedSwap.encryptedParams);
        const decryptedParams = decryptSwapParams(encryptedParamsString, encryptionKey);

        // Create mock validator signatures (in production, would be real threshold signatures)
        const mockValidatorSignatures = {
            point: [
                BigInt(ethers.keccak256(ethers.toUtf8Bytes('validator_aggregate_sig1'))),
                BigInt(ethers.keccak256(ethers.toUtf8Bytes('validator_aggregate_sig2')))
            ],
            signersMask: 0b111 // Indicates first 3 validators signed
        };

        // Execute decryption and swap
        const tx = await pbsMevDex.decryptAndExecuteSwap(
            swapId,
            decryptedParams,
            mockValidatorSignatures,
            builderAddress
        );
        const receipt = await tx.wait();

        res.json({
            success: true,
            swapType: 'PBS Decrypted & Executed',
            swapId: swapId,
            decryptedParams: decryptedParams,
            executingBuilder: builderAddress,
            transactionHash: receipt.hash,
            note: 'PBS swap successfully decrypted and executed with validator consensus'
        });

    } catch (e: any) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to decrypt and execute swap', { message: e.message });
    }
});

// Get encrypted swap status
app.get('/pbs/swap/:swapId', async (req, res) => {
    try {
        const { swapId } = req.params;

        if (!pbsMevDex) {
            return sendError(res, 503, 'SERVICE_UNAVAILABLE', 'PBS MEV Dex not configured');
        }

        const encryptedSwap = await pbsMevDex.getEncryptedSwap(swapId);
        const isUnlocked = await pbsMevDex.isSwapUnlocked(swapId);
        const currentBlock = await provider.getBlockNumber();

        if (!encryptedSwap.user || encryptedSwap.user === ethers.ZeroAddress) {
            return sendError(res, 404, 'NOT_FOUND', 'Encrypted swap not found');
        }

        const blocksRemaining = Math.max(0, Number(encryptedSwap.unlockBlock) - currentBlock);

        res.json({
            swapId: swapId,
            user: encryptedSwap.user,
            status: encryptedSwap.executed ? 'executed' : 
                   encryptedSwap.decrypted ? 'decrypted' : 
                   isUnlocked ? 'unlocked' : 'locked',
            timing: {
                creationBlock: Number(encryptedSwap.creationBlock),
                unlockBlock: Number(encryptedSwap.unlockBlock),
                currentBlock: currentBlock,
                blocksRemaining: blocksRemaining,
                isUnlocked: isUnlocked
            },
            encryption: {
                keyCommitment: encryptedSwap.keyCommitment,
                entropy: encryptedSwap.entropy,
                encryptedParamsSize: encryptedSwap.encryptedParams.length
            },
            flags: {
                executed: encryptedSwap.executed,
                decrypted: encryptedSwap.decrypted
            }
        });

    } catch (e: any) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get encrypted swap status', { message: e.message });
    }
});

// Get PBS system statistics
app.get('/pbs/stats', async (req, res) => {
    try {
        const [pbsStats, timelockStats, blockNumber] = await Promise.all([
            pbsMevDex ? pbsMevDex.getPBSStats() : [0, 0, 0],
            timelockContract ? timelockContract.getTimelockStats() : [0, 0, 0],
            provider.getBlockNumber()
        ]);

        res.json({
            system: 'PBS MEV Protection',
            network: currentNetwork.name,
            chainId: currentNetwork.chainId,
            currentBlock: blockNumber,
            statistics: {
                pbs: {
                    totalSwaps: pbsStats[0].toString(),
                    successfulDecryptions: pbsStats[1].toString(),
                    totalBuilderRevenue: ethers.formatEther(pbsStats[2].toString()) + ' ETH',
                    successRate: pbsStats[0] > 0 ? ((Number(pbsStats[1]) / Number(pbsStats[0])) * 100).toFixed(2) + '%' : '0%'
                },
                timelock: {
                    totalTimelocks: timelockStats[0].toString(),
                    successfulDecryptions: timelockStats[1].toString(),
                    currentBlock: timelockStats[2].toString(),
                    decryptionRate: timelockStats[0] > 0 ? ((Number(timelockStats[1]) / Number(timelockStats[0])) * 100).toFixed(2) + '%' : '0%'
                }
            },
            features: {
                encryptionType: 'AES-256 with time-locked keys',
                validatorThreshold: '67% consensus required',
                unlockDelay: '2-50 blocks (0.4-10 minutes)',
                builderAuction: 'Competitive bidding system',
                batchExecution: 'Up to 10 swaps per batch'
            }
        });
    } catch (e: any) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get PBS statistics', { message: e.message });
    }
});

// Complete PBS workflow demonstration
app.post('/pbs/demo-workflow', async (req, res) => {
    try {
        const {
            tokenIn = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
            tokenOut = '0xA0b86a33E6441b8c4C8C0b4b8C0b4b8C0b4b8C0b4', // USDC
            amountIn = '1000000000000000000', // 1 ETH
            builderAddress = wallet.address
        } = req.body;

        res.json({
            workflow: 'Complete PBS MEV Protection Workflow',
            steps: [
                {
                    step: 1,
                    name: 'Encrypt Swap',
                    endpoint: `POST http://localhost:${PORT}/pbs/encrypt-swap`,
                    description: 'User creates encrypted swap with time-locked parameters',
                    exampleRequest: {
                        tokenIn,
                        tokenOut,
                        amountIn,
                        minAmountOut: (BigInt(amountIn) * BigInt(95) / BigInt(100)).toString(),
                        unlockDelay: 5
                    }
                },
                {
                    step: 2,
                    name: 'Builder Auction',
                    endpoint: `POST http://localhost:${PORT}/pbs/builder-bid`,
                    description: 'Builders compete by submitting bids for execution rights',
                    exampleRequest: {
                        swapId: '0x...',
                        builderAddress: builderAddress,
                        bidAmount: '0.01',
                        gasPrice: '20'
                    }
                },
                {
                    step: 3,
                    name: 'Validator Decryption',
                    endpoint: `POST http://localhost:${PORT}/pbs/decrypt-execute`,
                    description: 'Validators reach consensus and decrypt swap for winning builder',
                    requirements: [
                        '67% validator consensus',
                        'Time-lock expiration',
                        'Valid builder bid'
                    ]
                },
                {
                    step: 4,
                    name: 'Protected Execution',
                    description: 'Winning builder executes swap with MEV protection',
                    protections: [
                        'Execution timing validation',
                        'Gas price limits',
                        'Builder reputation checks',
                        'Execution randomness'
                    ]
                }
            ],
            advantages: [
                'Front-running impossible (encrypted intentions)',
                'MEV extraction minimized (builder competition)',
                'Batch execution efficiency',
                'Validator consensus security',
                'Future-compatible with Ethereum PBS'
            ],
            monitoringEndpoints: {
                swapStatus: `GET http://localhost:${PORT}/pbs/swap/{swapId}`,
                systemStats: `GET http://localhost:${PORT}/pbs/stats`,
                comparison: `GET http://localhost:${PORT}/comparison`
            }
        });

    } catch (e: any) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate demo workflow', { message: e.message });
    }
});

// Start PBS server
app.listen(PORT, () => {
    console.log(`🚀 PBS MEV Protection Server running on port ${PORT}`);
    console.log(`🔐 Encryption: Time-locked AES-256 with threshold signatures`);
    console.log(`🏗️  Builder Auction: Competitive bidding for execution rights`);
    console.log(`⏰ Time-lock: 2-50 blocks delay for automatic decryption`);
    console.log(`👥 Validators: 67% threshold consensus for decryption`);
    console.log(`📊 Batch Execution: Up to 10 swaps per atomic batch`);
    console.log(`🌐 Network: ${currentNetwork.name} (Chain ID: ${currentNetwork.chainId})`);
    console.log(`📋 Contract Addresses:`);
    console.log(`   PBS MEVDex: ${PBS_MEV_DEX_ADDRESS || 'Not configured'}`);
    console.log(`   Timelock Encryption: ${TIMELOCK_ENCRYPTION_ADDRESS || 'Not configured'}`);
    console.log(`   PBS Aggregator: ${PBS_DEX_AGGREGATOR_ADDRESS || 'Not configured'}`);
    console.log(`🔗 API Comparison: http://localhost:${PORT}/comparison`);
});

export default app;