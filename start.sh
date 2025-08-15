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
echo "1. Start the server (requires deployed contracts)"
echo "2. Start the multi-dex server"
echo "3. Start the enhanced DEX server"
echo "4. Exit"

read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        echo "🚀 Starting the MEV-Protected DEX server..."
        echo "   Make sure you have CONTRACT_ADDRESS set in your .env file."
        read -p "Press Enter to continue..."
        yarn dev
        ;;
    2)
        echo "🚀 Starting the Multi-DEX server..."
        echo "   Make sure you have CONTRACT_ADDRESS set in your .env file."
        read -p "Press Enter to continue..."
        yarn dev:multi-dex
        ;;
    3)
        echo "🚀 Starting the Enhanced DEX server..."
        echo "   Make sure you have CONTRACT_ADDRESS set in your .env file."
        read -p "Press Enter to continue..."
        yarn dev:enhanced
        ;;
    4)
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
echo "   1. Make sure you have CONTRACT_ADDRESS set in your .env file"
echo "   2. Start the server: yarn dev"
echo "   3. Test the API endpoints"
echo "   4. Check the README.md for more information"
echo ""
echo "🔗 Useful commands:"
echo "   - Start server: yarn dev"
echo "   - Start multi-dex server: yarn dev:multi-dex"
echo "   - Start enhanced server: yarn dev:enhanced"
echo "   - Compile contracts: yarn compile"
