import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001';

// Client for Configurable Parameters MEV DEX
class ConfigurableParametersClient {
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

    // Execute MEV-protected swap with custom parameters
    async executeMEVProtectedSwap(
        tokenIn: string,
        tokenOut: string,
        amount: string,
        minAmountOut: string,
        options: {
            feeBps?: number;
            slippageBps?: number;
            saltHex?: string;
        } = {}
    ) {
        try {
            const response = await axios.post(`${this.baseUrl}/commit-reveal-swap`, {
                tokenIn,
                tokenOut,
                amount,
                minAmountOut,
                ...options
            });
            return response.data;
        } catch (error) {
            console.error('Failed to execute MEV-protected swap:', error);
            throw error;
        }
    }

    // Commit swap with custom parameters
    async commitSwap(
        tokenIn: string,
        tokenOut: string,
        amount: string,
        saltHex: string,
        options: {
            feeBps?: number;
            slippageBps?: number;
        } = {}
    ) {
        try {
            const response = await axios.post(`${this.baseUrl}/commit`, {
                tokenIn,
                tokenOut,
                amount,
                saltHex,
                ...options
            });
            return response.data;
        } catch (error) {
            console.error('Failed to commit swap:', error);
            throw error;
        }
    }

    // Reveal and execute swap with custom parameters
    async revealSwap(
        tokenIn: string,
        tokenOut: string,
        amount: string,
        saltHex: string,
        minAmountOut: string,
        options: {
            feeBps?: number;
            slippageBps?: number;
        } = {}
    ) {
        try {
            const response = await axios.post(`${this.baseUrl}/reveal`, {
                tokenIn,
                tokenOut,
                amount,
                saltHex,
                minAmountOut,
                ...options
            });
            return response.data;
        } catch (error) {
            console.error('Failed to reveal swap:', error);
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
    console.log('🚀 Configurable Parameters MEV DEX Client Example\n');

    const client = new ConfigurableParametersClient(API_BASE_URL);

    try {
        // 1. Check server health
        console.log('1. Checking server health...');
        const isHealthy = await client.checkHealth();
        console.log(`   Server health: ${isHealthy ? '✅ OK' : '❌ Failed'}\n`);

        if (!isHealthy) {
            console.log('❌ Server is not healthy. Please start the server first.');
            return;
        }

        // 2. Get contract info and parameter limits
        console.log('2. Getting contract information...');
        const contractInfo = await client.getContractInfo();
        const parameterLimits = await client.getParameterLimits();
        const defaultParams = await client.getDefaultParameters();

        console.log('   📋 Contract Information:');
        console.log(`   Contract Address: ${contractInfo.address}`);
        console.log(`   Default Fee: ${contractInfo.defaults.feeBps} bps (${contractInfo.defaults.feeBps / 100}%)`);
        console.log(`   Default Slippage: ${contractInfo.defaults.slippageBps} bps (${contractInfo.defaults.slippageBps / 100}%)\n`);

        console.log('   🎯 Parameter Limits:');
        console.log(`   Fee Range: ${parameterLimits.fee.min} - ${parameterLimits.fee.max} bps`);
        console.log(`   Slippage Range: ${parameterLimits.slippage.min} - ${parameterLimits.slippage.max} bps\n`);

        // 3. Example token addresses and amounts
        const usdcAddress = '0xA0b86a33E6441b8c4C8C0b4b8C0b4b8C0b4b8C0b4';
        const wethAddress = '0xB0b86a33E6441b8c4C8C0b4b8C0b4b8C0b4b8C0b4';
        const amount = '100000000'; // 100 USDC (6 decimals)

        // 4. Demonstrate different parameter configurations
        console.log('3. Demonstrating different parameter configurations...\n');

        // Configuration 1: Low fee, low slippage (conservative)
        console.log('   🔒 Configuration 1: Conservative (Low Fee, Low Slippage)');
        const conservativeFee = 15; // 0.15%
        const conservativeSlippage = 100; // 1%

        const conservativeFeeAmount = client.calculateFeeAmount(amount, conservativeFee);
        const conservativeSwapAmount = client.calculateSwapAmount(amount, conservativeFee);
        const conservativeMinOut = client.calculateMinAmountOut(conservativeSwapAmount, conservativeSlippage);

        console.log(`   Fee: ${conservativeFee} bps (${conservativeFee / 100}%)`);
        console.log(`   Fee Amount: ${conservativeFeeAmount} (${Number(conservativeFeeAmount) / 1000000} USDC)`);
        console.log(`   Swap Amount: ${conservativeSwapAmount} (${Number(conservativeSwapAmount) / 1000000} USDC)`);
        console.log(`   Min Amount Out: ${conservativeMinOut} (${Number(conservativeMinOut) / 1000000} USDC)`);
        console.log(`   Total Cost: ${Number(conservativeFeeAmount) / 1000000} USDC\n`);

        // Configuration 2: Standard fee, medium slippage (balanced)
        console.log('   ⚖️ Configuration 2: Balanced (Standard Fee, Medium Slippage)');
        const balancedFee = 30; // 0.3% (default)
        const balancedSlippage = 300; // 3% (default)

        const balancedFeeAmount = client.calculateFeeAmount(amount, balancedFee);
        const balancedSwapAmount = client.calculateSwapAmount(amount, balancedFee);
        const balancedMinOut = client.calculateMinAmountOut(balancedSwapAmount, balancedSlippage);

        console.log(`   Fee: ${balancedFee} bps (${balancedFee / 100}%)`);
        console.log(`   Fee Amount: ${balancedFeeAmount} (${Number(balancedFeeAmount) / 1000000} USDC)`);
        console.log(`   Swap Amount: ${balancedSwapAmount} (${Number(balancedSwapAmount) / 1000000} USDC)`);
        console.log(`   Min Amount Out: ${balancedMinOut} (${Number(balancedMinOut) / 1000000} USDC)`);
        console.log(`   Total Cost: ${Number(balancedFeeAmount) / 1000000} USDC\n`);

        // Configuration 3: High fee, high slippage (aggressive)
        console.log('   🚀 Configuration 3: Aggressive (High Fee, High Slippage)');
        const aggressiveFee = 50; // 0.5%
        const aggressiveSlippage = 500; // 5%

        const aggressiveFeeAmount = client.calculateFeeAmount(amount, aggressiveFee);
        const aggressiveSwapAmount = client.calculateSwapAmount(amount, aggressiveFee);
        const aggressiveMinOut = client.calculateMinAmountOut(aggressiveSwapAmount, aggressiveSlippage);

        console.log(`   Fee: ${aggressiveFee} bps (${aggressiveFee / 100}%)`);
        console.log(`   Fee Amount: ${aggressiveFeeAmount} (${Number(aggressiveFeeAmount) / 1000000} USDC)`);
        console.log(`   Swap Amount: ${aggressiveSwapAmount} (${Number(aggressiveSwapAmount) / 1000000} USDC)`);
        console.log(`   Min Amount Out: ${aggressiveMinOut} (${Number(aggressiveMinOut) / 1000000} USDC)`);
        console.log(`   Total Cost: ${Number(aggressiveFeeAmount) / 1000000} USDC\n`);

        // 5. Show how to execute with custom parameters
        console.log('4. Example: Execute MEV-protected swap with custom parameters...');
        console.log('   This would execute a swap with your chosen fee and slippage settings.\n');

        // 6. Parameter validation example
        console.log('5. Parameter validation examples...');

        // Valid parameters
        console.log('   ✅ Valid parameters:');
        console.log(`   Fee: 25 bps (0.25%) - Within limits: ${25 >= parameterLimits.fee.min && 25 <= parameterLimits.fee.max}`);
        console.log(`   Slippage: 250 bps (2.5%) - Within limits: ${250 >= parameterLimits.slippage.min && 250 <= parameterLimits.slippage.max}\n`);

        // Invalid parameters
        console.log('   ❌ Invalid parameters:');
        console.log(`   Fee: 600 bps (6%) - Within limits: ${600 >= parameterLimits.fee.min && 600 <= parameterLimits.fee.max}`);
        console.log(`   Slippage: 20 bps (0.2%) - Within limits: ${20 >= parameterLimits.slippage.min && 20 <= parameterLimits.slippage.max}\n`);

        console.log('✅ Configurable parameters client example completed successfully!');
        console.log('\n📚 Key benefits of configurable parameters:');
        console.log('   • Users can choose their preferred fee/slippage levels');
        console.log('   • Competitive pricing for different user segments');
        console.log('   • Better user experience with personalized settings');
        console.log('   • Maintains MEV protection regardless of parameters');

    } catch (error) {
        console.error('❌ Client example failed:', error);
    }
}

// Run the example
if (require.main === module) {
    main().catch(console.error);
}

export { ConfigurableParametersClient };
