#!/bin/bash

echo "🚀 Starting Unikron Ethereum MEV-Protected DEX..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check if Yarn is installed
if ! command -v yarn &> /dev/null; then
    echo "❌ Yarn is not installed. Please install Yarn first."
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from template..."
    cp env.example .env
    echo "📝 Please edit .env file with your configuration before continuing."
    echo "   Required: PRIVATE_KEY, CONTRACT_ADDRESS (after deployment)"
    read -p "Press Enter after updating .env file..."
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    yarn install
fi

# Compile contracts
echo "🔨 Compiling smart contracts..."
yarn compile

# Check if contracts compiled successfully
if [ $? -ne 0 ]; then
    echo "❌ Contract compilation failed. Please check the errors above."
    exit 1
fi

echo "✅ Contracts compiled successfully!"

# Ask user what they want to do
echo ""
echo "🎯 What would you like to do?"
echo "1. Deploy contracts to local network"
echo "2. Deploy contracts to Sepolia testnet"
echo "3. Start the server (requires deployed contracts)"
echo "4. Run the demo script"
echo "5. Run tests"
echo "6. Exit"

read -p "Enter your choice (1-6): " choice

case $choice in
    1)
        echo "🚀 Starting local Hardhat network..."
        echo "   This will start a local blockchain in a new terminal."
        echo "   Keep it running and open a new terminal for the next steps."
        
        # Start Hardhat node in background
        gnome-terminal -- bash -c "yarn hardhat node; exec bash" 2>/dev/null || \
        xterm -e "yarn hardhat node; exec bash" 2>/dev/null || \
        echo "   Please open a new terminal and run: yarn hardhat node"
        
        echo "⏳ Waiting for local network to start..."
        sleep 5
        
        echo "📦 Deploying contracts to local network..."
        yarn deploy
        
        echo "✅ Contracts deployed! Update your .env file with the new addresses."
        ;;
    2)
        echo "🌐 Deploying to Sepolia testnet..."
        echo "   Make sure you have SEPOLIA_RPC_URL and PRIVATE_KEY in your .env file."
        read -p "Press Enter to continue..."
        yarn deploy:sepolia
        ;;
    3)
        echo "🚀 Starting the MEV-Protected DEX server..."
        echo "   Make sure you have CONTRACT_ADDRESS set in your .env file."
        read -p "Press Enter to continue..."
        yarn dev
        ;;
    4)
        echo "🎭 Running the demo script..."
        echo "   This will deploy contracts locally and demonstrate MEV protection."
        read -p "Press Enter to continue..."
        yarn hardhat run scripts/demo.ts --network localhost
        ;;
    5)
        echo "🧪 Running tests..."
        yarn test
        ;;
    6)
        echo "👋 Goodbye!"
        exit 0
        ;;
    *)
        echo "❌ Invalid choice. Please run the script again."
        exit 1
        ;;
esac

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "📚 Next steps:"
echo "   1. If you deployed contracts, update your .env file with the new addresses"
echo "   2. Start the server: yarn dev"
echo "   3. Test the API endpoints or run the client example"
echo "   4. Check the README.md for more information"
echo ""
echo "🔗 Useful commands:"
echo "   - Start server: yarn dev"
echo "   - Run tests: yarn test"
echo "   - Compile contracts: yarn compile"
echo "   - Deploy contracts: yarn deploy"
echo "   - Run demo: yarn hardhat run scripts/demo.ts --network localhost"
