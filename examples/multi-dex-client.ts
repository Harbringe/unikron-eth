import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001';

// Client for the Multi-DEX Aggregator with MEV Protection
class MultiDexClient {
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

    // Get supported DEXs
    async getSupportedDexs() {
        try {
            const response = await axios.get(`${this.baseUrl}/dex/supported`);
            return response.data;
        } catch (error) {
            console.error('Failed to get supported DEXs:', error);
            throw error;
        }
    }

    // Get quotes from all DEXs
    async getAllQuotes(tokenIn: string, tokenOut: string, amount: string) {
        try {
            const response = await axios.get(`${this.baseUrl}/dex/quote`, {
                params: { tokenIn, tokenOut, amount }
            });
            return response.data;
        } catch (error) {
            console.error('Failed to get quotes:', error);
            throw error;
        }
    }

    // Get best quote only
    async getBestQuote(tokenIn: string, tokenOut: string, amount: string) {
        try {
            const response = await axios.get(`${this.baseUrl}/dex/best-quote`, {
                params: { tokenIn, tokenOut, amount }
            });
            return response.data;
        } catch (error) {
            console.error('Failed to get best quote:', error);
            throw error;
        }
    }

    // Compare DEXs with detailed analysis
    async compareDexs(tokenIn: string, tokenOut: string, amount: string) {
        try {
            const response = await axios.get(`${this.baseUrl}/dex/compare`, {
                params: { tokenIn, tokenOut, amount }
            });
            return response.data;
        } catch (error) {
            console.error('Failed to compare DEXs:', error);
            throw error;
        }
    }

    // Execute MEV-protected swap with DEX selection
    async executeMEVProtectedSwap(
        tokenIn: string,
        tokenOut: string,
        amount: string,
        minAmountOut: string,
        preferredDex?: string
    ) {
        try {
            const response = await axios.post(`${this.baseUrl}/dex/mev-swap`, {
                tokenIn,
                tokenOut,
                amount,
                minAmountOut,
                preferredDex
            });
            return response.data;
        } catch (error) {
            console.error('Failed to execute MEV-protected swap:', error);
            throw error;
        }
    }

    // Execute swap on specific DEX (without MEV protection)
    async executeSwapOnDex(
        dexName: string,
        tokenIn: string,
        tokenOut: string,
        amount: string,
        minAmountOut: string,
        swapData: string
    ) {
        try {
            const response = await axios.post(`${this.baseUrl}/dex/swap`, {
                dexName,
                tokenIn,
                tokenOut,
                amount,
                minAmountOut,
                swapData
            });
            return response.data;
        } catch (error) {
            console.error('Failed to execute swap on DEX:', error);
            throw error;
        }
    }

    // Execute swap on best DEX automatically
    async executeSwapOnBestDex(
        tokenIn: string,
        tokenOut: string,
        amount: string,
        minAmountOut: string,
        swapData: string
    ) {
        try {
            const response = await axios.post(`${this.baseUrl}/dex/auto-swap`, {
                tokenIn,
                tokenOut,
                amount,
                minAmountOut,
                swapData
            });
            return response.data;
        } catch (error) {
            console.error('Failed to execute swap on best DEX:', error);
            throw error;
        }
    }
}

// Example usage
async function main() {
    console.log('🚀 Multi-DEX Aggregator with MEV Protection Client Example\n');

    const client = new MultiDexClient(API_BASE_URL);

    try {
        // 1. Check server health
        console.log('1. Checking server health...');
        const isHealthy = await client.checkHealth();
        console.log(`   Server health: ${isHealthy ? '✅ OK' : '❌ Failed'}\n`);

        if (!isHealthy) {
            console.log('❌ Server is not healthy. Please start the server first.');
            return;
        }

        // 2. Get supported DEXs
        console.log('2. Getting supported DEXs...');
        const supportedDexs = await client.getSupportedDexs();
        console.log('   Supported DEXs:', supportedDexs.supportedDexs.join(', '), '\n');

        // 3. Example token addresses (USDC -> WETH)
        const usdcAddress = '0xA0b86a33E6441b8c4C8C0b4b8C0b4b8C0b4b8C0b4';
        const wethAddress = '0xB0b86a33E6441b8c4C8C0b4b8C0b4b8C0b4b8C0b4';
        const amount = '100000000'; // 100 USDC (6 decimals)

        // 4. Get quotes from all DEXs
        console.log('3. Getting quotes from all DEXs...');
        const allQuotes = await client.getAllQuotes(usdcAddress, wethAddress, amount);

        console.log('   📊 Multi-DEX Quote Summary:');
        console.log(`   Token In: ${allQuotes.tokenIn}`);
        console.log(`   Token Out: ${allQuotes.tokenOut}`);
        console.log(`   Amount In: ${allQuotes.amountIn}`);
        console.log(`   Recommended DEX: ${allQuotes.recommendedDex}`);
        console.log(`   Total Gas Estimate: ${allQuotes.totalGasEstimate}`);
        console.log(`   Average Slippage: ${allQuotes.averageSlippage} bps\n`);

        console.log('   📋 Individual DEX Quotes:');
        allQuotes.quotes.forEach((quote: any, index: number) => {
            console.log(`   ${index + 1}. ${quote.dexName}:`);
            console.log(`      Amount Out: ${quote.amountOut}`);
            console.log(`      Gas Estimate: ${quote.gasEstimate}`);
            console.log(`      Slippage: ${quote.slippage} bps`);
            console.log(`      Priority: ${quote.priority}`);
            console.log(`      Active: ${quote.isActive ? '✅' : '❌'}\n`);
        });

        // 5. Get best quote only
        console.log('4. Getting best quote only...');
        const bestQuote = await client.getBestQuote(usdcAddress, wethAddress, amount);
        console.log(`   🏆 Best Quote: ${bestQuote.bestQuote.dexName}`);
        console.log(`   Amount Out: ${bestQuote.bestQuote.amountOut}`);
        console.log(`   Gas Estimate: ${bestQuote.bestQuote.gasEstimate}`);
        console.log(`   Slippage: ${bestQuote.bestQuote.slippage} bps\n`);

        // 6. Compare DEXs with detailed analysis
        console.log('5. Comparing DEXs with detailed analysis...');
        const comparison = await client.compareDexs(usdcAddress, wethAddress, amount);

        console.log('   📈 DEX Comparison Statistics:');
        console.log(`   Best Amount: ${comparison.statistics.bestAmount}`);
        console.log(`   Worst Amount: ${comparison.statistics.worstAmount}`);
        console.log(`   Average Amount: ${comparison.statistics.averageAmount.toFixed(2)}`);
        console.log(`   Best Gas: ${comparison.statistics.bestGas}`);
        console.log(`   Worst Gas: ${comparison.statistics.worstGas}`);
        console.log(`   Average Gas: ${comparison.statistics.averageGas.toFixed(2)}`);
        console.log(`   Best Slippage: ${comparison.statistics.bestSlippage} bps`);
        console.log(`   Worst Slippage: ${comparison.statistics.worstSlippage} bps`);
        console.log(`   Average Slippage: ${comparison.statistics.averageSlippage.toFixed(2)} bps`);
        console.log(`   Recommendation: ${comparison.recommendation}\n`);

        // 7. Demonstrate MEV protection workflow
        console.log('6. MEV Protection Workflow:');
        console.log('   This demonstrates the complete workflow:');
        console.log('   Step 1: Compare all DEXs and get best quote');
        console.log('   Step 2: Commit to swap (intentions hidden)');
        console.log('   Step 3: Reveal and execute on selected DEX');
        console.log('   Note: In a real scenario, you would wait between steps\n');

        // 8. Show how to use the complete workflow
        console.log('7. Complete MEV-Protected Swap Example:');
        console.log('   Use the /dex/mev-swap endpoint for the full workflow');
        console.log('   This combines MEV protection with multi-DEX selection');
        console.log('   You can specify a preferred DEX or let it auto-select the best one\n');

        console.log('✅ Multi-DEX client example completed successfully!');
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

export { MultiDexClient };
