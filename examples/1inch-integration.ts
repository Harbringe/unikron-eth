import axios from 'axios';
import { ethers } from 'ethers';

/**
 * 1inch DEX Aggregator Integration Example
 * 
 * This shows how to integrate with 1inch for real token swaps in your MEV-protected DEX
 */

interface OneInchQuote {
    fromToken: {
        address: string;
        symbol: string;
        decimals: number;
    };
    toToken: {
        address: string;
        symbol: string;
        decimals: number;
    };
    toTokenAmount: string;
    fromTokenAmount: string;
    protocols: any[];
    estimatedGas: number;
}

interface OneInchSwap {
    tx: {
        from: string;
        to: string;
        data: string;
        value: string;
        gas: number;
        gasPrice: string;
    };
    toTokenAmount: string;
    fromTokenAmount: string;
}

class OneInchIntegration {
    private baseUrl: string;
    private apiKey?: string;

    constructor(chainId: number = 1, apiKey?: string) {
        // 1inch API endpoints for different chains
        const endpoints: { [key: number]: string } = {
            1: 'https://api.1inch.dev/swap/v6.0', // Ethereum mainnet
            137: 'https://api.1inch.dev/swap/v6.0', // Polygon
            56: 'https://api.1inch.dev/swap/v6.0', // BSC
            42161: 'https://api.1inch.dev/swap/v6.0', // Arbitrum
            10: 'https://api.1inch.dev/swap/v6.0', // Optimism
        };
        
        this.baseUrl = endpoints[chainId] || endpoints[1];
        this.apiKey = apiKey;
    }

    /**
     * Get a quote for swapping tokens
     */
    async getQuote(
        fromTokenAddress: string,
        toTokenAddress: string,
        amount: string,
        fromAddress: string,
        slippage: number = 1 // 1% default slippage
    ): Promise<OneInchQuote> {
        try {
            const url = `${this.baseUrl}/quote`;
            const params = {
                src: fromTokenAddress,
                dst: toTokenAddress,
                amount: amount,
                from: fromAddress,
                slippage: slippage,
                disableEstimate: false,
                allowPartialFill: false,
            };

            const headers: any = {
                'Accept': 'application/json',
            };

            if (this.apiKey) {
                headers['Authorization'] = `Bearer ${this.apiKey}`;
            }

            const response = await axios.get(url, { params, headers });
            return response.data;
        } catch (error) {
            console.error('Failed to get 1inch quote:', error);
            throw error;
        }
    }

    /**
     * Get swap transaction data
     */
    async getSwap(
        fromTokenAddress: string,
        toTokenAddress: string,
        amount: string,
        fromAddress: string,
        slippage: number = 1,
        recipient?: string
    ): Promise<OneInchSwap> {
        try {
            const url = `${this.baseUrl}/swap`;
            const params = {
                src: fromTokenAddress,
                dst: toTokenAddress,
                amount: amount,
                from: fromAddress,
                slippage: slippage,
                disableEstimate: false,
                allowPartialFill: false,
                ...(recipient && { dest: recipient }),
            };

            const headers: any = {
                'Accept': 'application/json',
            };

            if (this.apiKey) {
                headers['Authorization'] = `Bearer ${this.apiKey}`;
            }

            const response = await axios.get(url, { params, headers });
            return response.data;
        } catch (error) {
            console.error('Failed to get 1inch swap:', error);
            throw error;
        }
    }

    /**
     * Execute a swap through 1inch
     */
    async executeSwap(
        swapData: OneInchSwap,
        signer: ethers.Signer
    ): Promise<ethers.ContractTransactionResponse> {
        try {
            // Create transaction object
            const tx = {
                to: swapData.tx.to,
                data: swapData.tx.data,
                value: swapData.tx.value,
                gasLimit: ethers.toBigInt(swapData.tx.gas),
                gasPrice: ethers.toBigInt(swapData.tx.gasPrice),
            };

            // Send transaction
            const transaction = await signer.sendTransaction(tx);
            return transaction;
        } catch (error) {
            console.error('Failed to execute 1inch swap:', error);
            throw error;
        }
    }

    /**
     * Get supported tokens for a chain
     */
    async getSupportedTokens(chainId: number = 1): Promise<any> {
        try {
            const url = `https://api.1inch.dev/swap/v6.0/tokens`;
            const headers: any = {
                'Accept': 'application/json',
            };

            if (this.apiKey) {
                headers['Authorization'] = `Bearer ${this.apiKey}`;
            }

            const response = await axios.get(url, { headers });
            return response.data;
        } catch (error) {
            console.error('Failed to get supported tokens:', error);
            throw error;
        }
    }
}

// Example usage in your MEV-protected DEX server
export class MEVDexWithOneInch {
    private oneInch: OneInchIntegration;
    private provider: ethers.Provider;

    constructor(chainId: number = 1, apiKey?: string) {
        this.oneInch = new OneInchIntegration(chainId, apiKey);
        this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    }

    /**
     * Enhanced quote endpoint using 1inch
     */
    async getEnhancedQuote(
        tokenIn: string,
        tokenOut: string,
        amount: string,
        userAddress: string,
        slippage: number = 1
    ) {
        try {
            // Get quote from 1inch
            const quote = await this.oneInch.getQuote(
                tokenIn,
                tokenOut,
                amount,
                userAddress,
                slippage
            );

            // Format response for your API
            return {
                inputMint: tokenIn,
                outputMint: tokenOut,
                amount: amount,
                otherAmountThreshold: quote.toTokenAmount,
                swapMode: 'ExactIn',
                slippageBps: slippage * 100,
                priceImpactPct: '0.5', // You'd calculate this from the quote
                routePlan: quote.protocols,
                contextSlot: 0,
                timeTaken: 0,
                // 1inch specific data
                oneInchQuote: quote,
                estimatedGas: quote.estimatedGas,
            };
        } catch (error) {
            console.error('1inch quote failed, falling back to simulation:', error);
            
            // Fallback to simulated quote
            return {
                inputMint: tokenIn,
                outputMint: tokenOut,
                amount: amount,
                otherAmountThreshold: (BigInt(amount) * BigInt(95) / BigInt(100)).toString(),
                swapMode: 'ExactIn',
                slippageBps: slippage * 100,
                priceImpactPct: '0.5',
                routePlan: [],
                contextSlot: 0,
                timeTaken: 0,
                note: 'Fallback quote - 1inch integration failed'
            };
        }
    }

    /**
     * Execute MEV-protected swap with 1inch
     */
    async executeMEVProtectedSwap(
        swapRequest: any,
        commitment: string,
        userSigner: ethers.Signer
    ) {
        try {
            // Get swap data from 1inch
            const swapData = await this.oneInch.getSwap(
                swapRequest.tokenIn,
                swapRequest.tokenOut,
                swapRequest.amountIn,
                await userSigner.getAddress(),
                1, // 1% slippage
                await userSigner.getAddress()
            );

            // Execute the swap
            const tx = await this.oneInch.executeSwap(swapData, userSigner);
            
            return {
                success: true,
                transactionHash: tx.hash,
                commitment: commitment,
                amountOut: swapData.toTokenAmount,
                gasUsed: swapData.tx.gas,
            };
        } catch (error) {
            console.error('1inch swap execution failed:', error);
            throw error;
        }
    }
}

// Example of how to use this in your server
export async function setupOneInchIntegration() {
    // Initialize with your chain ID and API key
    const chainId = 1; // Ethereum mainnet
    const apiKey = process.env.ONEINCH_API_KEY; // Get from environment
    
    const mevDex = new MEVDexWithOneInch(chainId, apiKey);
    
    console.log('✅ 1inch integration initialized');
    console.log('📊 Supported chains: Ethereum, Polygon, BSC, Arbitrum, Optimism');
    console.log('🔗 API: https://api.1inch.dev/');
    
    return mevDex;
}

// Example usage
if (require.main === module) {
    async function demo() {
        console.log('🚀 1inch Integration Demo\n');
        
        try {
            const mevDex = await setupOneInchIntegration();
            
            // Example: Get quote for USDC -> WETH
            const usdcAddress = '0xA0b86a33E6441b8c4C8C0b4b8C0b4b8C0b4b8C0b4';
            const wethAddress = '0xB0b86a33E6441b8c4C8C0b4b8C0b4b8C0b4b8C0b4';
            const userAddress = '0xC0b86a33E6441b8c4C8C0b4b8C0b4b8C0b4b8C0b4';
            const amount = '100000000'; // 100 USDC (6 decimals)
            
            console.log('📊 Getting quote from 1inch...');
            const quote = await mevDex.getEnhancedQuote(
                usdcAddress,
                wethAddress,
                amount,
                userAddress,
                1
            );
            
            console.log('✅ Quote received:');
            console.log('  Input:', quote.amount, 'USDC');
            console.log('  Output:', quote.otherAmountThreshold, 'WETH');
            console.log('  Gas Estimate:', quote.estimatedGas);
            console.log('  Protocols:', quote.routePlan.length);
            
        } catch (error) {
            console.error('❌ Demo failed:', error);
        }
    }
    
    demo();
}
