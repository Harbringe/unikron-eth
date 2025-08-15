# Unikron Ethereum MEV-Protected DEX

A decentralized exchange (DEX) built on Ethereum with built-in MEV (Maximal Extractable Value) protection using a commit-reveal pattern.

## 🚀 Features

- **MEV Protection**: Uses cryptographic commitments to hide swap intentions until execution
- **Commit-Reveal Pattern**: Prevents front-running and sandwich attacks
- **Gas Optimization**: Efficient smart contracts with minimal gas costs
- **Multi-Token Support**: Works with any ERC20 tokens
- **Configurable Fees**: Adjustable trading fees (default 0.3%)
- **Timeout Protection**: Automatic commitment expiration after 1 hour
- **Admin Controls**: Pause/unpause functionality and fee management

## 🏗️ Architecture

### Smart Contracts

- **MEVDex.sol**: Main DEX contract with MEV protection
- **MockERC20.sol**: Test tokens for development and testing

### Server API

- **Express.js Server**: RESTful API for DEX operations
- **Ethereum Integration**: Web3.js integration for blockchain interactions
- **MEV Protection Endpoints**: Complete commit-reveal workflow

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

### 1. Set up Environment
```bash
# Copy environment template
cp env.example .env
# Edit .env with your configuration (PRIVATE_KEY, CONTRACT_ADDRESS, etc.)
```

### 2. Install Dependencies
```bash
yarn install
```

### 3. Start Server
```bash
# Start the main DEX server
yarn dev

# Or start the multi-dex server
yarn dev:multi-dex

# Or start the enhanced DEX server
yarn dev:enhanced
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

## 📚 API Endpoints

### Core DEX Operations

#### `POST /commit`
Commit to a swap (first step of MEV protection)
```json
{
  "tokenIn": "0x...",
  "tokenOut": "0x...",
  "amount": "100000000",
  "minAmountOut": "50000000000000000",
  "saltHex": "0x..."
}
```

#### `POST /reveal`
Reveal and execute swap (second step)
```json
{
  "tokenIn": "0x...",
  "tokenOut": "0x...",
  "amount": "100000000",
  "minAmountOut": "50000000000000000",
  "saltHex": "0x..."
}
```

#### `POST /commit-reveal-swap`
Complete MEV-protected swap in one call
```json
{
  "tokenIn": "0x...",
  "tokenOut": "0x...",
  "amount": "100000000",
  "minAmountOut": "50000000000000000"
}
```

### Utility Endpoints

- `GET /health` - Server health check
- `GET /gas-price` - Current gas prices
- `GET /contract-info` - Contract configuration
- `GET /commitment/:commitment` - Commitment status
- `POST /cancel-commitment` - Cancel expired commitment

## 🧪 Testing

The server can be tested using the API endpoints directly. You can use tools like:
- Postman
- curl
- Any HTTP client

Example API calls are documented in the endpoints section below.

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

## 🔮 Future Enhancements

- [ ] Integration with 1inch/0x DEX aggregators
- [ ] Cross-chain MEV protection
- [ ] Advanced order types (limit orders, stop-loss)
- [ ] Liquidity provision features
- [ ] Governance token integration
- [ ] Mobile app support

---

**Note**: This is a development version. Use on mainnet at your own risk and ensure proper testing and auditing.
# unikron-eth
