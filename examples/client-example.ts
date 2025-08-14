import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001';

// Example client for interacting with the MEV-Protected DEX server
class MEVDexClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    // Health check
    async checkHealth(): Promise<boolean> {
        try {
            const response = await axios.get(`${this.baseUrl}/health`);
            return response.data.ok === true;
        } catch (error) {
            console.error('Health check failed:', error);
            return false;
        }
    }

    // Get current gas prices
    async getGasPrice() {
        try {
            const response = await axios.get(`${this.baseUrl}/gas-price`);
            return response.data;
        } catch (error) {
            console.error('Failed to get gas price:', error);
            throw error;
        }
    }

    // Get contract information
    async getContractInfo() {
        try {
            const response = await axios.get(`${this.baseUrl}/contract-info`);
            return response.data;
        } catch (error) {
            console.error('Failed to get contract info:', error);
            throw error;
        }
    }

    // Get a quote for swapping tokens
    async getQuote(tokenIn: string, tokenOut: string, amount: string, slippageBps: number = 100) {
        try {
            const response = await axios.get(`${this.baseUrl}/quote`, {
                params: {
                    inputMint: tokenIn,
                    outputMint: tokenOut,
                    amount,
                    slippageBps
                }
            });
            return response.data;
        } catch (error) {
            console.error('Failed to get quote:', error);
            throw error;
        }
    }

    // Commit to a swap (first step of MEV protection)
    async commitSwap(tokenIn: string, tokenOut: string, amount: string, minAmountOut: string, saltHex: string) {
        try {
            const response = await axios.post(`${this.baseUrl}/commit`, {
                tokenIn,
                tokenOut,
                amount,
                minAmountOut,
                saltHex
            });
            return response.data;
        } catch (error) {
            console.error('Failed to commit swap:', error);
            throw error;
        }
    }

    // Reveal and execute swap (second step)
    async revealSwap(tokenIn: string, tokenOut: string, amount: string, minAmountOut: string, saltHex: string) {
        try {
            const response = await axios.post(`${this.baseUrl}/reveal`, {
                tokenIn,
                tokenOut,
                amount,
                minAmountOut,
                saltHex
            });
            return response.data;
        } catch (error) {
            console.error('Failed to reveal swap:', error);
            throw error;
        }
    }

    // Complete MEV-protected swap in one call
    async commitRevealSwap(tokenIn: string, tokenOut: string, amount: string, minAmountOut: string) {
        try {
            const response = await axios.post(`${this.baseUrl}/commit-reveal-swap`, {
                tokenIn,
                tokenOut,
                amount,
                minAmountOut
            });
            return response.data;
        } catch (error) {
            console.error('Failed to execute commit-reveal swap:', error);
            throw error;
        }
    }

    // Get commitment status
    async getCommitmentStatus(commitment: string) {
        try {
            const response = await axios.get(`${this.baseUrl}/commitment/${commitment}`);
            return response.data;
        } catch (error) {
            console.error('Failed to get commitment status:', error);
            throw error;
        }
    }

    // Cancel a commitment
    async cancelCommitment(commitment: string) {
        try {
            const response = await axios.post(`${this.baseUrl}/cancel-commitment`, {
                commitment
            });
            return response.data;
        } catch (error) {
            console.error('Failed to cancel commitment:', error);
            throw error;
        }
    }
}

// Example usage
async function main() {
    console.log('🚀 MEV-Protected DEX Client Example\n');

    const client = new MEVDexClient(API_BASE_URL);

    try {
        // 1. Check server health
        console.log('1. Checking server health...');
        const isHealthy = await client.checkHealth();
        console.log(`   Server health: ${isHealthy ? '✅ OK' : '❌ Failed'}\n`);

        if (!isHealthy) {
            console.log('❌ Server is not healthy. Please start the server first.');
            return;
        }

        // 2. Get contract information
        console.log('2. Getting contract information...');
        const contractInfo = await client.getContractInfo();
        console.log('   Contract Address:', contractInfo.contractAddress);
        console.log('   Fee (basis points):', contractInfo.feeBps);
        console.log('   Network:', contractInfo.network);
        console.log('   Chain ID:', contractInfo.chainId, '\n');

        // 3. Get current gas prices
        console.log('3. Getting current gas prices...');
        const gasPrice = await client.getGasPrice();
        console.log('   Gas Price:', gasPrice.gasPrice ? `${gasPrice.gasPrice} wei` : 'N/A');
        console.log('   Max Fee Per Gas:', gasPrice.maxFeePerGas ? `${gasPrice.maxFeePerGas} wei` : 'N/A');
        console.log('   Max Priority Fee:', gasPrice.maxPriorityFeePerGas ? `${gasPrice.maxPriorityFeePerGas} wei` : 'N/A\n');

        // 4. Get a quote for swapping USDC to WETH
        console.log('4. Getting swap quote (USDC → WETH)...');
        const usdcAddress = '0xA0b86a33E6441b8c4C8C0b4b8C0b4b8C0b4b8C0b4'; // Example address
        const wethAddress = '0xB0b86a33E6441b8c4C8C0b4b8C0b4b8C0b4b8C0b4'; // Example address
        const amount = '100000000'; // 100 USDC (6 decimals)

        try {
            const quote = await client.getQuote(usdcAddress, wethAddress, amount, 100);
            console.log('   Quote received successfully');
            console.log('   Input Amount:', quote.amount);
            console.log('   Output Amount:', quote.otherAmountThreshold);
            console.log('   Slippage:', quote.slippageBps, 'basis points\n');
        } catch (error) {
            console.log('   Quote failed (expected in demo mode)\n');
        }

        // 5. Demonstrate MEV protection workflow
        console.log('5. MEV Protection Workflow Example:');
        console.log('   This demonstrates the two-step process:');
        console.log('   Step 1: Commit to swap (intentions hidden)');
        console.log('   Step 2: Reveal and execute (MEV protection active)');
        console.log('   Note: In a real scenario, you would wait between steps\n');

        // 6. Show how to use the complete workflow
        console.log('6. Complete MEV-Protected Swap Example:');
        console.log('   Use the /commit-reveal-swap endpoint for the full workflow');
        console.log('   This combines both steps in a single API call\n');

        console.log('✅ Client example completed successfully!');
        console.log('\n📚 To test with real transactions:');
        console.log('   1. Deploy contracts using: yarn deploy');
        console.log('   2. Update .env with contract addresses');
        console.log('   3. Start server using: yarn dev');
        console.log('   4. Run this client example');

    } catch (error) {
        console.error('❌ Client example failed:', error);
    }
}

// Run the example
if (require.main === module) {
    main().catch(console.error);
}

export { MEVDexClient };
