# PBS vs Commit-Reveal MEV Protection Comparison

## Overview

The Unikron DEX implements two parallel MEV protection systems:

1. **Commit-Reveal MEV Protection** (Port 3001) - Traditional hash-based commitment system
2. **PBS Encryption MEV Protection** (Port 3101) - Advanced encryption with validator consensus

## System Architecture Comparison

### Commit-Reveal System

**Location:** `contracts/MEVDex.sol` + `contracts/RealDexAggregator.sol`
**Server:** `src/production-server.ts` (Port 3001)

**Architecture:**
```
User → Commit Hash → Wait Period → Reveal Parameters → Execute Swap
```

**Components:**
- Hash commitment of swap parameters
- Time-based reveal windows (1 hour timeout)
- Direct execution after reveal
- Single-transaction finality

### PBS Encryption System

**Location:** `contracts/pbs/PBSMevDex.sol` + `contracts/pbs/TimelockEncryption.sol`
**Server:** `src/pbs-server.ts` (Port 3101)

**Architecture:**
```
User → Encrypt Parameters → Builder Auction → Validator Consensus → Execute Swap
```

**Components:**
- AES-256 time-locked encryption
- Builder bidding mechanism
- BLS threshold signatures
- Validator network consensus

## Technical Comparison

| Feature | Commit-Reveal | PBS Encryption |
|---------|---------------|----------------|
| **Encryption** | SHA-256 Hash Commitment | AES-256 Time-locked |
| **Reveal Mechanism** | User reveals directly | Validator threshold consensus |
| **Execution Model** | Direct execution | Builder auction + execution |
| **MEV Protection** | Hash hiding + timing | Full encryption + consensus |
| **Gas Efficiency** | 2 transactions | Batch execution possible |
| **Complexity** | Low | High |
| **Security Model** | Cryptographic commitments | Threshold cryptography |
| **Future Compatibility** | Current Ethereum | Ethereum 2.0 PBS ready |

## Implementation Details

### Commit-Reveal Protection Flow

1. **Commitment Phase:**
   ```typescript
   POST /mev/commit
   {
     "tokenIn": "0x...",
     "tokenOut": "0x...", 
     "amountIn": "1000000000000000000",
     "commitment": "0x..." // keccak256(parameters + salt)
   }
   ```

2. **Reveal Phase:**
   ```typescript
   POST /mev/reveal-execute
   {
     "commitmentId": "0x...",
     "swapParams": {...},
     "salt": "0x..."
   }
   ```

### PBS Encryption Protection Flow

1. **Encryption Phase:**
   ```typescript
   POST /pbs/encrypt-swap
   {
     "tokenIn": "0x...",
     "tokenOut": "0x...",
     "amountIn": "1000000000000000000",
     "unlockDelay": 5 // blocks
   }
   ```

2. **Builder Auction:**
   ```typescript
   POST /pbs/builder-bid
   {
     "swapId": "0x...",
     "builderAddress": "0x...",
     "bidAmount": "0.01",
     "gasPrice": "20"
   }
   ```

3. **Validator Decryption:**
   ```typescript
   POST /pbs/decrypt-execute
   {
     "swapId": "0x...",
     "encryptionKey": "0x...",
     "builderAddress": "0x..."
   }
   ```

## Security Analysis

### Commit-Reveal Security

**Strengths:**
- Well-established cryptographic primitives
- Simple attack surface
- Immediate finality after reveal
- No external dependencies

**Weaknesses:**
- Vulnerable to timing attacks during reveal
- Single point of failure (user must reveal)
- Limited to individual transactions
- No protection against builder manipulation

### PBS Encryption Security

**Strengths:**
- Full parameter encryption until execution
- Distributed trust model with validators
- Builder competition reduces MEV extraction
- Future-compatible with Ethereum PBS roadmap
- Batch execution reduces per-transaction costs

**Weaknesses:**
- Complex system with multiple attack vectors
- Dependency on validator network honesty
- Higher computational overhead
- Newer, less battle-tested approach

## Performance Comparison

### Commit-Reveal Performance

- **Setup Time:** ~13 seconds (1 block confirmation)
- **Total Time:** ~1 hour (commitment timeout)
- **Gas Cost:** ~150k gas (2 transactions)
- **Throughput:** Individual transactions only
- **Reliability:** 99%+ (simple execution path)

### PBS Encryption Performance

- **Setup Time:** ~65 seconds (5 blocks unlock delay)
- **Total Time:** ~10 minutes (auction + consensus)
- **Gas Cost:** ~200k gas (batch execution savings)
- **Throughput:** Up to 10 swaps per batch
- **Reliability:** 95%+ (complex coordination required)

## Use Case Recommendations

### Choose Commit-Reveal When:

- Simple MEV protection is sufficient
- Low-frequency trading
- Minimal complexity requirements
- Testing/development phases
- Single-user applications

### Choose PBS Encryption When:

- Maximum MEV protection needed
- High-frequency trading operations
- Batch execution benefits important
- Future Ethereum PBS compatibility desired
- Professional/institutional usage

## API Endpoints Summary

### Commit-Reveal Endpoints (Port 3001)

```
GET  /health                    - System status
GET  /mev/status               - MEV protection status
POST /mev/commit               - Create swap commitment
POST /mev/reveal-execute       - Reveal and execute swap
GET  /mev/commitment/:id       - Get commitment status
```

### PBS Encryption Endpoints (Port 3101)

```
GET  /health                   - System status  
GET  /comparison              - System comparison
POST /pbs/encrypt-swap        - Create encrypted swap
POST /pbs/builder-bid         - Submit builder bid
POST /pbs/decrypt-execute     - Decrypt and execute
GET  /pbs/swap/:swapId        - Get swap status
GET  /pbs/stats               - PBS statistics
POST /pbs/demo-workflow       - Demo workflow guide
```

## Migration Path

To transition from Commit-Reveal to PBS:

1. **Test Phase:** Run both systems in parallel
2. **Builder Onboarding:** Register authorized builders
3. **Validator Setup:** Configure threshold signature network
4. **Gradual Migration:** Move high-value swaps to PBS first
5. **Full Migration:** Deprecate commit-reveal for new swaps
6. **Maintenance:** Keep commit-reveal for emergency fallback

## Monitoring and Observability

Both systems provide comprehensive monitoring:

- Real-time swap execution metrics
- MEV protection effectiveness tracking
- Gas cost analysis
- Success rate monitoring
- Builder performance analytics (PBS only)
- Validator consensus tracking (PBS only)

## Conclusion

The dual implementation provides flexibility for different use cases:

- **Commit-Reveal** offers simplicity and reliability for basic MEV protection
- **PBS Encryption** provides advanced protection suitable for high-value operations

Users can choose the appropriate system based on their security requirements, technical sophistication, and alignment with future Ethereum roadmap priorities.