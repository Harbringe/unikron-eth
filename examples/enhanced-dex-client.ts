import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001';

// Enhanced DEX Client with MEV Toggle
class EnhancedDexClient {
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

    // Get network information
    async getNetworkInfo() {
        try {
            const response = await axios.get(`${this.baseUrl}/network`);
            return response.data;
        } catch (error) {
            console.error('Failed to get network info:', error);
            throw error;
        }
    }

    // Get contract info with parameter limits
    async getContractInfo() {
        try {
            const response = await axios.get(`${this.baseUrl}/contract-info`);
            return response.data;
        } catch (error) {
            console.error('Failed to get contract info:', error);
            throw error;
        }
    }

    // Get parameter limits
    async getParameterLimits() {
        try {
            const response = await axios.get(`${this.baseUrl}/parameters/limits`);
            return response.data;
        } catch (error) {
            console.error('Failed to get parameter limits:', error);
            throw error;
        }
    }

    // Get default parameters
    async getDefaultParameters() {
        try {
            const response = await axios.get(`${this.baseUrl}/parameters/defaults`);
            return response.data;
        } catch (error) {
            console.error('Failed to get default parameters:', error);
            throw error;
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

    // Get quotes from all DEXs with enhanced information
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

    // Execute swap with MEV toggle
    async executeSwap(
        tokenIn: string,
        tokenOut: string,
        amount: string,
        minAmountOut: string,
        options: {
            enableMEV: boolean;
            feeBps?: number;
            slippageBps?: number;
            preferredDex?: string;
            saltHex?: string;
        }
    ) {
        try {
            const response = await axios.post(`${this.baseUrl}/dex/swap`, {
                tokenIn,
                tokenOut,
                amount,
                minAmountOut,
                options
            });
            return response.data;
        } catch (error) {
            console.error('Failed to execute swap:', error);
            throw error;
        }
    }

    // Calculate fee amount in tokens
    calculateFeeAmount(amount: string, feeBps: number): string {
        const amountBigInt = BigInt(amount);
        const feeBigInt = BigInt(feeBps);
        const feeAmount = (amountBigInt * feeBigInt) / BigInt(10000);
        return feeAmount.toString();
    }

    // Calculate actual swap amount after fees
    calculateSwapAmount(amount: string, feeBps: number): string {
        const amountBigInt = BigInt(amount);
        const feeAmount = BigInt(this.calculateFeeAmount(amount, feeBps));
        return (amountBigInt - feeAmount).toString();
    }

    // Calculate minimum amount out based on slippage
    calculateMinAmountOut(amount: string, slippageBps: number): string {
        const amountBigInt = BigInt(amount);
        const slippageBigInt = BigInt(slippageBps);
        const minAmount = (amountBigInt * (BigInt(10000) - slippageBigInt)) / BigInt(10000);
        return minAmount.toString();
    }
}

// Example usage
async function main() {
    console.log('🚀 Enhanced DEX Client with MEV Toggle Example\n');

    const client = new EnhancedDexClient(API_BASE_URL);

    try {
        // 1. Check server health
        console.log('1. Checking server health...');
        const isHealthy = await client.checkHealth();
        console.log(`   Server health: ${isHealthy ? '✅ OK' : '❌ Failed'}\n`);

        if (!isHealthy) {
            console.log('❌ Server is not healthy. Please start the server first.');
            return;
        }

        // 2. Get network information
        console.log('2. Getting network information...');
        const networkInfo = await client.getNetworkInfo();
        console.log(`   Current Network: ${networkInfo.current}`);
        console.log(`   Network Name: ${networkInfo.network}`);
        console.log(`   Chain ID: ${networkInfo.chainId}`);
        console.log(`   Available Networks: ${networkInfo.available.join(', ')}\n`);

        // 3. Get contract info and parameter limits
        console.log('3. Getting contract information...');
        const contractInfo = await client.getContractInfo();
        const parameterLimits = await client.getParameterLimits();
        const defaultParams = await client.getDefaultParameters();

        console.log('   📋 Contract Information:');
        console.log(`   Contract Address: ${contractInfo.address}`);
        console.log(`   Network: ${contractInfo.network}`);
        console.log(`   Default Fee: ${contractInfo.defaults.feeBps} bps (${contractInfo.defaults.feeBps / 100}%)`);
        console.log(`   Default Slippage: ${contractInfo.defaults.slippageBps} bps (${contractInfo.defaults.slippageBps / 100}%)\n`);

        console.log('   🎯 Parameter Limits:');
        console.log(`   Fee Range: ${parameterLimits.fee.min} - ${parameterLimits.fee.max} bps`);
        console.log(`   Slippage Range: ${parameterLimits.slippage.min} - ${parameterLimits.slippage.max} bps\n`);

        // 4. Get supported DEXs
        console.log('4. Getting supported DEXs...');
        const supportedDexs = await client.getSupportedDexs();
        console.log(`   Supported DEXs: ${supportedDexs.supportedDexs.join(', ')}`);
        console.log(`   Network: ${supportedDexs.network}\n`);

        // 5. Example token addresses and amounts
        const usdcAddress = '0xA0b86a33E6441b8c4C8C0b4b8C0b4b8C0b4b8C0b4';
        const wethAddress = '0xB0b86a33E6441b8c4C8C0b4b8C0b4b8C0b4b8C0b4';
        const amount = '100000000'; // 100 USDC (6 decimals)

        // 6. Get quotes from all DEXs with enhanced information
        console.log('5. Getting enhanced quotes from all DEXs...');
        const allQuotes = await client.getAllQuotes(usdcAddress, wethAddress, amount);

        console.log('   📊 Enhanced Multi-DEX Quote Summary:');
        console.log(`   Token In: ${allQuotes.tokenIn}`);
        console.log(`   Token Out: ${allQuotes.tokenOut}`);
        console.log(`   Amount In: ${allQuotes.amountIn}`);
        console.log(`   Recommended DEX: ${allQuotes.recommendedDex}`);
        console.log(`   Network: ${allQuotes.network} (Chain ID: ${allQuotes.chainId})\n`);

        console.log('   📋 Individual DEX Quotes with Routes:');
        allQuotes.quotes.forEach((quote: any, index: number) => {
            console.log(`   ${index + 1}. ${quote.dexName}:`);
            console.log(`      Amount Out: ${quote.amountOut}`);
            console.log(`      Gas Estimate: ${quote.gasEstimate}`);
            console.log(`      Slippage: ${quote.slippage} bps`);
            console.log(`      Priority: ${quote.priority}`);
            console.log(`      Route: ${quote.route.join(' → ')}`);
            console.log(`      Price Impact: ${quote.priceImpact}%`);
            console.log(`      Active: ${quote.isActive ? '✅' : '❌'}\n`);
        });

        // 7. Compare DEXs with detailed analysis
        console.log('6. Comparing DEXs with detailed analysis...');
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

        // 8. Demonstrate MEV vs Non-MEV swaps
        console.log('7. Demonstrating MEV vs Non-MEV Swaps...\n');

        // Example 1: MEV-protected swap
        console.log('   🛡️ Example 1: MEV-Protected Swap');
        console.log('   This swap will be protected against front-running and sandwich attacks');
        console.log('   Parameters: enableMEV=true, custom fee and slippage\n');

        // Example 2: Regular swap (no MEV protection)
        console.log('   ⚠️ Example 2: Regular Swap (No MEV Protection)');
        console.log('   This swap is vulnerable to front-running and sandwich attacks');
        console.log('   Parameters: enableMEV=false, auto-selected DEX\n');

        // 9. Show parameter configuration examples
        console.log('8. Parameter Configuration Examples...\n');

        // Conservative configuration
        console.log('   🔒 Conservative Configuration:');
        console.log('   - Low fee: 15 bps (0.15%)');
        console.log('   - Low slippage: 100 bps (1%)');
        console.log('   - MEV protection: Enabled');
        console.log('   - Best for: Large trades, risk-averse users\n');

        // Balanced configuration
        console.log('   ⚖️ Balanced Configuration:');
        console.log('   - Standard fee: 30 bps (0.3%)');
        console.log('   - Medium slippage: 300 bps (3%)');
        console.log('   - MEV protection: Optional');
        console.log('   - Best for: Regular trading, balanced approach\n');

        // Aggressive configuration
        console.log('   🚀 Aggressive Configuration:');
        console.log('   - High fee: 50 bps (0.5%)');
        console.log('   - High slippage: 500 bps (5%)');
        console.log('   - MEV protection: Disabled');
        console.log('   - Best for: Fast execution, volatile markets\n');

        // 10. Show how to execute different swap types
        console.log('9. Swap Execution Examples...');
        console.log('   Use the /dex/swap endpoint with different options:');
        console.log('   - enableMEV: true/false to toggle MEV protection');
        console.log('   - feeBps: Set custom fee (5-500 bps)');
        console.log('   - slippageBps: Set custom slippage (5-500 bps)');
        console.log('   - preferredDex: Force specific DEX selection');
        console.log('   - saltHex: Custom salt for MEV protection\n');

        console.log('✅ Enhanced DEX client example completed successfully!');
        console.log('\n📚 Key Features:');
        console.log('   • MEV Protection Toggle: Enable/disable as needed');
        console.log('   • Enhanced DEX Comparison: Routes, price impact, efficiency');
        console.log('   • Configurable Parameters: Fee and slippage from frontend');
        console.log('   • Multi-Network Support: Sepolia, zkSync, Mainnet');
        console.log('   • Smart DEX Selection: Best price + lowest slippage');

    } catch (error) {
        console.error('❌ Client example failed:', error);
    }
}

// Run the example
if (require.main === module) {
    main().catch(console.error);
}

export { EnhancedDexClient };
