# Unikron Ethereum MEV-Protected DEX - Production Ready

A fully production-ready decentralized exchange (DEX) built on Ethereum with built-in MEV (Maximal Extractable Value) protection using a commit-reveal pattern. Features real DEX aggregation across Uniswap V2/V3, SushiSwap, 1inch, and Curve with actual swap execution.

## 🚀 Features

### 🛡️ MEV Protection
- **Commit-Reveal Pattern**: Prevents front-running and sandwich attacks
- **Cryptographic Commitments**: Hide swap intentions until execution
- **Time-Lock Security**: 1-hour commitment timeout for security
- **Zero Knowledge**: No swap details exposed during commit phase

### 🔄 Real DEX Aggregation  
- **Multi-DEX Support**: Uniswap V2/V3, SushiSwap, 1inch, Curve
- **Real Swap Execution**: Actual integration with DEX contracts (no mocks)
- **Best Price Discovery**: Automatic selection of optimal route
- **Gas Optimization**: Considers both price and gas costs
- **Slippage Protection**: Advanced slippage and price impact calculations

### ⚡ Production Features
- **Comprehensive Testing**: Full unit and integration test suite
- **Error Handling**: Robust error handling and fallback mechanisms
- **Admin Controls**: Pause/unpause, emergency functions, fee management
- **Multi-Network**: Support for Mainnet, Sepolia, and other networks
- **RESTful API**: Production-ready Express.js server
- **Real-Time Quotes**: Live price feeds from multiple DEX sources

## 🏗️ Architecture

### Core Smart Contracts

- **RealDexAggregator.sol**: Production DEX aggregator with real swap execution
- **MEVDex.sol**: MEV-protected DEX with commit-reveal pattern  
- **WorkingMultiDex.sol**: Interface contract for backward compatibility
- **OneInchIntegration.sol**: Production 1inch aggregator integration
- **MockERC20.sol**: Test tokens for development and testing

### Interface Contracts

- **IUniswapV2Router.sol**: Uniswap V2 router interface
- **IUniswapV3Router.sol**: Uniswap V3 router interface  
- **I1inchAggregator.sol**: 1inch aggregation router interface

### Server Infrastructure

- **Production Server**: Full-featured Express.js API with real integrations
- **Enhanced Server**: MEV protection with multi-DEX support  
- **Legacy Servers**: Backward compatibility endpoints
- **Comprehensive Testing**: Unit tests, integration tests, deployment scripts

## 📋 Prerequisites

- Node.js 18+ and Yarn
- Ethereum development environment (Hardhat)
- Local blockchain (Ganache) or testnet access

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd unikron-eth-dex
   ```

2. **Install dependencies**
   ```bash
   yarn install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. **Compile contracts**
   ```bash
   yarn compile
   ```

## 🚀 Quick Start

### 1. Clone and Install
```bash
git clone <repository-url>
cd unikron-eth-dex
yarn install
```

### 2. Set up Environment
```bash
# Copy environment template
cp env.example .env
```

Edit `.env` with your configuration:
```env
# Network Configuration
DEFAULT_NETWORK=sepolia
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your-api-key
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/your-api-key

# Wallet Configuration  
PRIVATE_KEY=your-private-key

# Contract Addresses (set after deployment)
MEV_DEX_ADDRESS=0x...
REAL_DEX_AGGREGATOR_ADDRESS=0x...
MULTI_DEX_ADDRESS=0x...

# Server Configuration
PORT=3001
```

### 3. Deploy Contracts
```bash
# Compile contracts
yarn compile

# Deploy to Sepolia testnet
yarn deploy:sepolia

# Or deploy to local network
yarn deploy

# Or deploy to mainnet (use with caution)
yarn deploy:mainnet
```

### 4. Start Production Server
```bash
# Development mode with production contracts
yarn dev:production

# Or production mode
yarn build
yarn start:production
```

### 5. Alternative Server Options
```bash
# Legacy server (basic functionality)
yarn dev

# Enhanced server (MEV protection)
yarn dev:enhanced

# Multi-DEX server (quote comparison)
yarn dev:multi-dex
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `RPC_URL` | Ethereum RPC endpoint | `http://127.0.0.1:8545` |
| `PRIVATE_KEY` | Wallet private key | Required |
| `CONTRACT_ADDRESS` | MEVDex contract address | Required after deployment |

### Network Configuration

The project supports multiple networks:
- **Localhost**: Development and testing
- **Sepolia**: Ethereum testnet
- **Mainnet**: Ethereum mainnet (use with caution)

## 📚 Production API Endpoints

### 🔍 Information & Quotes

#### `GET /health` - System Health Check
Returns comprehensive system status including network, contracts, and connectivity.

#### `GET /network` - Network Information  
Returns current network configuration, chain ID, and contract addresses.

#### `GET /quotes?tokenIn=0x...&tokenOut=0x...&amount=1000000000000000000`
Get quotes from all supported DEXs with real pricing data.

#### `GET /best-quote?tokenIn=0x...&tokenOut=0x...&amount=1000000000000000000`
Get the best available quote across all DEXs.

#### `GET /gas` - Gas Price Information
Returns current gas prices, base fee, and priority fees.

### 🛡️ MEV-Protected Swaps

#### `POST /mev/commit` - Create MEV Protection Commitment
```json
{
  "tokenIn": "0x...",
  "tokenOut": "0x...", 
  "amountIn": "1000000000000000000",
  "minAmountOut": "950000000000000000",
  "feeBps": 30,
  "slippageBps": 300
}
```

#### `POST /mev/reveal` - Execute Protected Swap
```json
{
  "swapRequest": {
    "tokenIn": "0x...",
    "tokenOut": "0x...",
    "amountIn": "1000000000000000000", 
    "minAmountOut": "950000000000000000",
    "deadline": 1640995200,
    "salt": "0x...",
    "feeBps": 30,
    "slippageBps": 300
  },
  "commitment": "0x..."
}
```

#### `POST /mev/swap` - Complete MEV-Protected Swap (One Call)
```json
{
  "tokenIn": "0x...",
  "tokenOut": "0x...",
  "amountIn": "1000000000000000000",
  "minAmountOut": "950000000000000000",
  "feeBps": 30,
  "slippageBps": 300
}
```

### ⚡ Regular Swaps (No MEV Protection)

#### `POST /swap` - Execute Regular Swap
```json
{
  "tokenIn": "0x...",
  "tokenOut": "0x...",
  "amountIn": "1000000000000000000",
  "minAmountOut": "950000000000000000",
  "recipient": "0x...",
  "preferredDex": 1,
  "useMultiHop": false
}
```

### 📊 Commitment Management

#### `GET /commitment/:commitment` - Check Commitment Status
Returns commitment details, status, and time remaining.

#### `POST /commitment/cancel` - Cancel Expired Commitment
```json
{
  "commitment": "0x..."
}
```

## 🧪 Testing

### Run Tests
```bash
# Run all tests
yarn test

# Run tests with coverage
yarn test:coverage

# Run specific test file
npx hardhat test test/RealDexAggregator.test.ts
npx hardhat test test/MEVDex.test.ts
```

### Manual Testing with API
You can test the API using tools like Postman, curl, or any HTTP client:

```bash
# Check system health
curl http://localhost:3001/health

# Get quotes for WETH -> USDC swap
curl "http://localhost:3001/quotes?tokenIn=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&tokenOut=0xA0b86a33E6441b8c4C8C0b4b8C0b4b8C0b4b8C0b4&amount=1000000000000000000"

# Execute MEV-protected swap
curl -X POST http://localhost:3001/mev/swap \
  -H "Content-Type: application/json" \
  -d '{
    "tokenIn": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    "tokenOut": "0xA0b86a33E6441b8c4C8C0b4b8C0b4b8C0b4b8C0b4",
    "amountIn": "1000000000000000000",
    "minAmountOut": "2000000000"
  }'
```

## 🔒 MEV Protection Explained

### How It Works

1. **Commit Phase**: User creates a cryptographic commitment of their swap parameters
2. **Reveal Phase**: User reveals the actual parameters and executes the swap
3. **Protection**: MEV bots cannot see the actual swap until it's revealed

### Benefits

- **Front-running Prevention**: Bots can't see pending swaps
- **Sandwich Attack Protection**: No MEV extraction from user transactions
- **Fair Execution**: All users get the same execution environment

### Example Flow

```typescript
// 1. Create commitment
const commitment = await createCommitment(swapParams);
await commitSwap(commitment);

// 2. Wait for block confirmation
await waitForConfirmation(commitment);

// 3. Reveal and execute
await revealAndSwap(swapParams, commitment);
```

## 🚀 Deployment

### Local Development
```bash
# Start the server locally
yarn dev
```

### Production
```bash
# Build the project
yarn build

# Start the production server
yarn start
```

## 📊 Gas Optimization

The contracts are optimized for gas efficiency:
- Minimal storage operations
- Efficient data structures
- Batch operations where possible
- Gas refunds for expired commitments

## 🔐 Security Features

- **Reentrancy Protection**: Prevents reentrancy attacks
- **Access Control**: Owner-only admin functions
- **Input Validation**: Comprehensive parameter validation
- **Emergency Controls**: Pause functionality for emergencies
- **Timeout Protection**: Automatic commitment expiration

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test your changes thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For questions and support:
- Create an issue in the repository
- Check the documentation
- Review the API endpoints for usage examples

## 🚨 Production Readiness

### ✅ What's Complete
- ✅ **Real DEX Integration**: Actual Uniswap V2/V3, SushiSwap, 1inch integration
- ✅ **MEV Protection**: Full commit-reveal implementation with cryptographic security
- ✅ **Comprehensive Testing**: Unit tests, integration tests, error handling
- ✅ **Production Server**: RESTful API with real-time quotes and swap execution
- ✅ **Multi-Network Support**: Mainnet, Sepolia, custom networks
- ✅ **Gas Optimization**: Advanced routing considers both price and gas costs
- ✅ **Security Features**: Reentrancy protection, access control, emergency functions

### 🔧 Deployment Requirements
- Ethereum node access (Alchemy, Infura, or self-hosted)
- Sufficient ETH for gas fees and contract deployment
- Private key for deployment and transaction signing
- Network configuration for target blockchain

### ⚠️ Security Considerations
- **Mainnet Deployment**: Thoroughly test on Sepolia before mainnet deployment
- **Private Keys**: Never commit private keys to version control
- **Access Control**: Properly configure admin functions and authorized callers  
- **Emergency Functions**: Ensure emergency withdrawal functions are properly secured
- **Slippage Limits**: Configure appropriate slippage protection for user safety

## 🔮 Future Enhancements

- [ ] Cross-chain MEV protection (Polygon, BSC, Arbitrum)
- [ ] Advanced order types (limit orders, stop-loss, DCA)
- [ ] Liquidity provision and yield farming features
- [ ] Governance token and DAO integration
- [ ] Mobile SDK and wallet integration
- [ ] Advanced MEV protection strategies
- [ ] Integration with additional DEX aggregators (Matcha, ParaSwap)
- [ ] Flash loan arbitrage detection and prevention

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support & Contributing

- **Issues**: Report bugs and request features via GitHub Issues
- **Documentation**: Check this README and inline code documentation  
- **Testing**: Run the comprehensive test suite before making changes
- **Security**: Report security vulnerabilities privately to the maintainers

## ⚠️ Disclaimer

This software is provided "as is" without warranty. Users are responsible for:
- Thorough testing before production use
- Security audits of smart contracts
- Proper configuration and key management
- Compliance with applicable regulations

**Use at your own risk. Always test thoroughly on testnets before mainnet deployment.**

---

**Unikron DEX** - Production-ready MEV-protected decentralized exchange for Ethereum
