#!/bin/bash

echo "🚀 Deploying Production-Ready DEX System..."
echo "=============================================="

# Check if we're in the right directory
if [ ! -f "hardhat.config.ts" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found. Please create one first."
    exit 1
fi

echo "📋 Current network configuration:"
npx hardhat console --network sepolia --eval "
    const network = await ethers.provider.getNetwork();
    console.log('Network:', network.name);
    console.log('Chain ID:', network.chainId);
"

echo ""
echo "🔧 Deploying contracts..."

# Deploy the production system
npx hardhat run scripts/deploy-production.ts --network sepolia

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "📝 Next steps:"
    echo "1. Copy the contract addresses from the deployment output above"
    echo "2. Update your .env file with:"
    echo "   REAL_DEX_ADDRESS=<RealDexIntegration address>"
    echo "   MEV_DEX_ADDRESS=<MEVDex address>"
    echo "3. Restart your server: yarn dev:enhanced"
    echo "4. Test the system with the frontend"
    echo ""
    echo "🌐 For mainnet deployment:"
    echo "1. Update NetworkConfig.sol with mainnet addresses"
    echo "2. Change isMainnet = true in RealDexIntegration"
    echo "3. Deploy with: npx hardhat run scripts/deploy-production.ts --network mainnet"
else
    echo ""
    echo "❌ Deployment failed. Please check the error messages above."
    exit 1
fi
